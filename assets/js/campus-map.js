/**
 * FUTURE POINTS - Campus Map & Pin Marker Module
 * Firebase Database / Storage 連携 & 多層フォールバック対応
 */

(function () {
  'use strict';

  // カテゴリ設定（色・アイコン・ラベル）
  const PIN_CATEGORIES = {
    cleanup: {
      label: '美化・ごみ拾い',
      icon: '🌱',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.4)',
      defaultDays: 7 // 1週間で自動消去
    },
    lost: {
      label: '忘れ物・落とし物',
      icon: '🔍',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.15)',
      border: 'rgba(59, 130, 246, 0.4)',
      defaultDays: 30 // 忘れ物は長めに設定（30日間）
    },
    notice: {
      label: '注意・連絡事項',
      icon: '⚠️',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.4)',
      defaultDays: 14 // 2週間
    },
    spot: {
      label: 'おすすめ・憩い',
      icon: '💡',
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.15)',
      border: 'rgba(168, 85, 247, 0.4)',
      defaultDays: 7 // 1週間で自動消去
    },
    facility: {
      label: '校舎・施設メモ',
      icon: '🏫',
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.15)',
      border: 'rgba(236, 72, 153, 0.4)',
      defaultDays: 30 // 施設メモは長め
    }
  };

  const PDF_URL = 'editable_campus_map_pastel.pdf';
  const LOCAL_PINS_KEY = 'mirai_campus_pins';
  const LOCAL_MAP_CACHE_KEY = 'mirai_campus_map_cache';

  // 内部ステート
  let currentMapImage = null; // Imageオブジェクト（キャッシュまたはレンダリング結果）
  let isMapLoaded = false;
  let pdfDoc = null;
  let pdfPage = null;

  // トランスフォーム（ズーム・パン）ステート
  let scale = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let hasDragged = false;

  // ピンステート
  let pinsData = {};
  let currentFilter = 'all';
  let isPinMode = false;
  let pendingPinCoord = null;
  let selectedCategory = 'cleanup';

  // DOM要素
  let viewportEl, stageEl, canvasEl, overlayEl, loadingEl;
  let guideBannerEl, togglePinModeBtn, filterChipsContainer, pinListContainer, pinCountBadge;
  let mapFileInput;

  // ログインユーザー名取得
  function getCurrentUser() {
    try {
      const stored = localStorage.getItem('mirai_currentUser');
      if (stored) {
        const u = JSON.parse(stored);
        return {
          email: u.email || 'user@example.com',
          name: u.name || (u.email ? u.email.split('@')[0] : 'ゲスト')
        };
      }
    } catch (e) {
      console.warn('User load failed:', e);
    }
    return { email: 'guest@example.com', name: 'ゲスト' };
  }

  // 初期化エントリポイント
  function initCampusMap() {
    viewportEl = document.getElementById('campus-map-viewport');
    stageEl = document.getElementById('campus-map-stage');
    canvasEl = document.getElementById('campus-map-canvas');
    overlayEl = document.getElementById('campus-map-overlay');
    loadingEl = document.getElementById('campus-map-loading');
    guideBannerEl = document.getElementById('campus-map-guide-banner');
    togglePinModeBtn = document.getElementById('btn-toggle-pin-mode');
    filterChipsContainer = document.getElementById('campus-map-filters');
    pinListContainer = document.getElementById('campus-map-list-items');
    pinCountBadge = document.getElementById('campus-map-pin-count');
    mapFileInput = document.getElementById('campus-map-file-input');

    if (!viewportEl || !canvasEl || !stageEl) {
      console.warn('Campus map DOM elements not ready.');
      return;
    }

    setupEventListeners();
    setupPanAndZoom();
    setupDropZone();
    initFirebaseSync();
    startMapLoadingFlow();
  }

  // マップ読み込みフロー（Firebase → ローカルキャッシュ → PDF相対パス → ファイル選択UI）
  function startMapLoadingFlow() {
    showLoadingSpinner('データベースおよびマップデータを読み込み中...');

    // Step 1: Firebase Realtime Database をチェック
    if (typeof firebase !== 'undefined' && firebase.database) {
      const db = firebase.database();
      db.ref('mirai_campus_map').once('value').then(snapshot => {
        const mapMeta = snapshot.val();
        if (mapMeta && mapMeta.imageData) {
          console.log('Firebaseからマップ画像データを読み込みました');
          renderImageToCanvas(mapMeta.imageData, () => {
            saveMapToLocalStorage(mapMeta.imageData);
          });
          return;
        }
        // なければStep 2へ
        checkLocalCacheOrFetch();
      }).catch(err => {
        console.warn('Firebase map read error, falling back:', err);
        checkLocalCacheOrFetch();
      });
    } else {
      checkLocalCacheOrFetch();
    }
  }

  // Step 2: ローカルキャッシュをチェック、なければPDFのフェッチ
  function checkLocalCacheOrFetch() {
    try {
      const cached = localStorage.getItem(LOCAL_MAP_CACHE_KEY);
      if (cached && cached.startsWith('data:image')) {
        console.log('ローカルストレージからマップ画像を復元しました');
        renderImageToCanvas(cached);
        return;
      }
    } catch (e) {
      console.warn('Local cache read error:', e);
    }

    // Step 3: PDFファイルから読み込みを試みる
    loadPdfFromUrl(PDF_URL);
  }

  // PDFをURLから読み込む
  function loadPdfFromUrl(url) {
    showLoadingSpinner('PDFマップを解析・描画中...');

    if (typeof window.pdfjsLib === 'undefined') {
      console.warn('PDF.js not loaded, showing file picker');
      showFilePickerFallback('PDFライブラリの初期化に失敗しました。下のボタンからファイルを選択してください。');
      return;
    }

    // Worker設定
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    } catch (e) {
      console.warn('Worker set error:', e);
    }

    // PDFドキュメントの取得
    const loadingTask = window.pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
      cMapPacked: true
    });

    loadingTask.promise.then(pdf => {
      pdfDoc = pdf;
      return pdf.getPage(1);
    }).then(page => {
      pdfPage = page;
      renderPdfPage(page);
    }).catch(err => {
      console.warn('PDF fetch error (likely CORS or file:// protocol):', err);
      showFilePickerFallback('マップPDFの自動読み込みが制限されています。下のボタンから「editable_campus_map_pastel.pdf」を選択して登録してください（一度登録するとデータベースに保存されます）。');
    });
  }

  // PDFページをCanvasにレンダリング
  function renderPdfPage(page) {
    const viewportWidth = viewportEl.clientWidth || 800;
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const fitScale = (viewportWidth / unscaledViewport.width);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const renderViewport = page.getViewport({ scale: fitScale * dpr });

    canvasEl.width = renderViewport.width;
    canvasEl.height = renderViewport.height;

    const cssWidth = unscaledViewport.width * fitScale;
    const cssHeight = unscaledViewport.height * fitScale;
    canvasEl.style.width = cssWidth + 'px';
    canvasEl.style.height = cssHeight + 'px';

    stageEl.style.width = cssWidth + 'px';
    stageEl.style.height = cssHeight + 'px';
    overlayEl.style.width = cssWidth + 'px';
    overlayEl.style.height = cssHeight + 'px';

    const ctx = canvasEl.getContext('2d');
    const renderContext = {
      canvasContext: ctx,
      viewport: renderViewport
    };

    page.render(renderContext).promise.then(() => {
      isMapLoaded = true;
      hideLoading();
      resetPanAndZoom();
      renderPins();

      // レンダリング結果をDataURL化してFirebase & localStorageにキャッシュ保存
      try {
        const dataUrl = canvasEl.toDataURL('image/jpeg', 0.88);
        saveMapToFirebaseAndLocal(dataUrl);
      } catch (e) {
        console.warn('Canvas export warning:', e);
      }
    }).catch(err => {
      console.error('PDF render error:', err);
      showFilePickerFallback('PDFの描画中にエラーが発生しました。');
    });
  }

  // 画像データ（DataURL）から直接Canvasに描画
  function renderImageToCanvas(dataUrl, callback) {
    showLoadingSpinner('マップを描画中...');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      currentMapImage = img;
      const viewportWidth = viewportEl.clientWidth || 800;
      const imgWidth = img.naturalWidth || img.width;
      const imgHeight = img.naturalHeight || img.height;

      const fitScale = (viewportWidth / imgWidth);
      const cssWidth = viewportWidth;
      const cssHeight = imgHeight * fitScale;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      canvasEl.width = cssWidth * dpr;
      canvasEl.height = cssHeight * dpr;

      canvasEl.style.width = cssWidth + 'px';
      canvasEl.style.height = cssHeight + 'px';
      stageEl.style.width = cssWidth + 'px';
      stageEl.style.height = cssHeight + 'px';
      overlayEl.style.width = cssWidth + 'px';
      overlayEl.style.height = cssHeight + 'px';

      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

      isMapLoaded = true;
      hideLoading();
      resetPanAndZoom();
      renderPins();

      if (callback) callback();
    };
    img.onerror = function () {
      console.warn('Image load failed from data URL');
      showFilePickerFallback('マップ画像の読み込みに失敗しました。');
    };
    img.src = dataUrl;
  }

  // ユーザーが手動でファイルを選択した時の処理（PDFまたは画像）
  function handleFileSelected(file) {
    if (!file) return;

    showLoadingSpinner(`ファイル「${file.name}」を処理中...`);

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    if (isPdf) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const typedArray = new Uint8Array(e.target.result);
        if (typeof window.pdfjsLib === 'undefined') {
          alert('PDF.js ライブラリが読み込まれていません。');
          return;
        }
        window.pdfjsLib.getDocument({ data: typedArray }).promise.then(pdf => {
          pdfDoc = pdf;
          return pdf.getPage(1);
        }).then(page => {
          pdfPage = page;
          renderPdfPage(page);
          showToast('✅ PDFマップを読み込み、データベースに保存しました！');
        }).catch(err => {
          console.error('Manual PDF parse error:', err);
          alert('選択されたPDFの読み込みに失敗しました: ' + err.message);
          showFilePickerFallback('PDFの読み込みに失敗しました。別のファイルを試してください。');
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      // 画像ファイルの場合
      const reader = new FileReader();
      reader.onload = function (e) {
        const dataUrl = e.target.result;
        renderImageToCanvas(dataUrl, () => {
          saveMapToFirebaseAndLocal(dataUrl);
          showToast('✅ マップ画像を読み込み、データベースに保存しました！');
        });
      };
      reader.readAsDataURL(file);
    }
  }

  // Firebase Database および localStorage にマップデータを保存
  function saveMapToFirebaseAndLocal(dataUrl) {
    saveMapToLocalStorage(dataUrl);

    if (typeof firebase !== 'undefined' && firebase.database) {
      const user = getCurrentUser();
      const payload = {
        imageData: dataUrl,
        updatedAt: Date.now(),
        updatedBy: user.name,
        fileName: 'editable_campus_map_pastel.pdf'
      };

      firebase.database().ref('mirai_campus_map').set(payload)
        .then(() => {
          console.log('Firebase Database にマップ画像キャッシュを保存しました');
        })
        .catch(err => {
          console.warn('Firebase map save error (size limit or permission):', err);
        });
    }
  }

  function saveMapToLocalStorage(dataUrl) {
    try {
      localStorage.setItem(LOCAL_MAP_CACHE_KEY, dataUrl);
    } catch (e) {
      console.warn('localStorage map quota exceeded:', e);
    }
  }

  // フォールバック用ファイル選択UI表示
  function showFilePickerFallback(msg) {
    if (!loadingEl) return;
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = `
      <div style="text-align: center; max-width: 420px; padding: 1.5rem; background: rgba(18, 24, 38, 0.95); border: 1px solid var(--panel-border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🗺️</div>
        <h4 style="font-size: 1rem; color: var(--text-main); margin-bottom: 0.5rem;">マップファイルを読み込む</h4>
        <p style="font-size: 0.775rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.25rem;">
          ${msg}
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <label class="campus-map-btn btn-pin-mode" style="cursor: pointer; justify-content: center; padding: 0.65rem 1rem;">
            📁 editable_campus_map_pastel.pdf を選択
            <input type="file" id="fallback-file-input" accept=".pdf,image/*" style="display: none;">
          </label>
          <button type="button" class="campus-map-btn" style="justify-content: center;" onclick="window.CampusMap.reload()">
            🔄 再試行
          </button>
        </div>
      </div>
    `;

    const fallbackInput = document.getElementById('fallback-file-input');
    if (fallbackInput) {
      fallbackInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          handleFileSelected(e.target.files[0]);
        }
      });
    }
  }

  // ドラッグ＆ドロップ対応
  function setupDropZone() {
    if (!viewportEl) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      viewportEl.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        viewportEl.style.outline = '2px dashed var(--accent)';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      viewportEl.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        viewportEl.style.outline = '';
      }, false);
    });

    viewportEl.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleFileSelected(dt.files[0]);
      }
    }, false);
  }

  function showLoadingSpinner(text) {
    if (!loadingEl) return;
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = `
      <div class="campus-map-spinner"></div>
      <span style="font-size: 0.875rem; font-weight: 600;">${text}</span>
    `;
  }

  function hideLoading() {
    if (loadingEl) loadingEl.style.display = 'none';
  }

  // パン＆ズーム設定
  function setupPanAndZoom() {
    viewportEl.addEventListener('mousedown', e => {
      if (e.target.closest('.campus-map-pin') || e.target.closest('.campus-map-float-controls')) {
        return;
      }
      isDragging = true;
      hasDragged = false;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
      viewportEl.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const newX = e.clientX - dragStartX;
      const newY = e.clientY - dragStartY;
      if (Math.abs(newX - panX) > 3 || Math.abs(newY - panY) > 3) {
        hasDragged = true;
      }
      panX = newX;
      panY = newY;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        viewportEl.classList.remove('is-dragging');
      }
    });

    // タッチ操作
    let initialTouchDistance = 0;
    viewportEl.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        if (e.target.closest('.campus-map-pin') || e.target.closest('.campus-map-float-controls')) return;
        isDragging = true;
        hasDragged = false;
        dragStartX = e.touches[0].clientX - panX;
        dragStartY = e.touches[0].clientY - panY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialTouchDistance = Math.hypot(dx, dy);
      }
    }, { passive: true });

    viewportEl.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && isDragging) {
        const newX = e.touches[0].clientX - dragStartX;
        const newY = e.touches[0].clientY - dragStartY;
        if (Math.abs(newX - panX) > 4 || Math.abs(newY - panY) > 4) {
          hasDragged = true;
        }
        panX = newX;
        panY = newY;
        applyTransform();
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (initialTouchDistance > 0) {
          const factor = dist / initialTouchDistance;
          zoomBy(factor > 1 ? 1.03 : 0.97);
          initialTouchDistance = dist;
        }
      }
    }, { passive: true });

    viewportEl.addEventListener('touchend', () => {
      isDragging = false;
      initialTouchDistance = 0;
    });

    // ホイールズーム
    viewportEl.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = viewportEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.deltaY < 0 ? 1.12 : 0.88;
      zoomAt(delta, mouseX, mouseY);
    }, { passive: false });

    // クリック（ピン設置）
    viewportEl.addEventListener('click', e => {
      if (hasDragged) return;
      if (e.target.closest('.campus-map-pin') || e.target.closest('.campus-map-float-controls')) return;
      if (isPinMode) {
        handleMapClickForPin(e);
      }
    });

    // リサイズ
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (currentMapImage) {
          renderImageToCanvas(currentMapImage.src);
        } else if (pdfPage) {
          renderPdfPage(pdfPage);
        }
      }, 300);
    });
  }

  function applyTransform() {
    stageEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function zoomBy(factor) {
    const newScale = Math.min(Math.max(scale * factor, 0.5), 3.5);
    const rect = viewportEl.getBoundingClientRect();
    zoomAt(newScale / scale, rect.width / 2, rect.height / 2);
  }

  function zoomAt(factor, px, py) {
    const newScale = Math.min(Math.max(scale * factor, 0.5), 3.5);
    const actualFactor = newScale / scale;
    panX = px - (px - panX) * actualFactor;
    panY = py - (py - panY) * actualFactor;
    scale = newScale;
    applyTransform();
  }

  function resetPanAndZoom() {
    scale = 1.0;
    const stageWidth = parseFloat(stageEl.style.width) || viewportEl.clientWidth;
    const stageHeight = parseFloat(stageEl.style.height) || viewportEl.clientHeight;
    const vpWidth = viewportEl.clientWidth;
    const vpHeight = viewportEl.clientHeight;

    panX = Math.round((vpWidth - stageWidth) / 2);
    panY = Math.round((vpHeight - stageHeight) / 2);
    if (panY > 20) panY = 15;
    applyTransform();
  }

  // ピン設置モードの切り替え
  function togglePinMode() {
    isPinMode = !isPinMode;
    updatePinModeUI();
  }

  function setPinMode(active) {
    isPinMode = active;
    updatePinModeUI();
  }

  function updatePinModeUI() {
    if (!togglePinModeBtn || !viewportEl) return;

    if (isPinMode) {
      togglePinModeBtn.classList.add('active');
      togglePinModeBtn.innerHTML = '<span>✕</span> ピン設置を中止';
      viewportEl.classList.add('pin-mode');
      if (guideBannerEl) guideBannerEl.classList.add('show');
    } else {
      togglePinModeBtn.classList.remove('active');
      togglePinModeBtn.innerHTML = '<span>📍</span> ピンを刺す';
      viewportEl.classList.remove('pin-mode');
      if (guideBannerEl) guideBannerEl.classList.remove('show');
      clearTempMarker();
    }
  }

  // マップクリック時のピン座標計算
  function handleMapClickForPin(e) {
    const stageRect = stageEl.getBoundingClientRect();
    const stageWidth = stageRect.width;
    const stageHeight = stageRect.height;

    const clickX = e.clientX - stageRect.left;
    const clickY = e.clientY - stageRect.top;

    if (clickX < 0 || clickX > stageWidth || clickY < 0 || clickY > stageHeight) return;

    pendingPinCoord = {
      x: Math.round((clickX / stageWidth) * 10000) / 100,
      y: Math.round((clickY / stageHeight) * 10000) / 100
    };

    showTempMarker(pendingPinCoord.x, pendingPinCoord.y);
    openAddPinModal();
  }

  function showTempMarker(x, y) {
    clearTempMarker();
    const temp = document.createElement('div');
    temp.id = 'temp-campus-pin';
    temp.className = 'campus-map-pin bounce';
    temp.style.left = x + '%';
    temp.style.top = y + '%';
    temp.innerHTML = `
      <div class="pin-marker-body" style="filter: drop-shadow(0 0 10px #f59e0b);">
        <svg viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16C0 26.5 16 40 16 40C16 40 32 26.5 32 16C32 7.163 24.837 0 16 0Z" fill="#f59e0b"/>
          <circle cx="16" cy="15" r="9" fill="#ffffff"/>
        </svg>
        <span class="pin-marker-icon">📍</span>
      </div>
    `;
    overlayEl.appendChild(temp);
  }

  function clearTempMarker() {
    const temp = document.getElementById('temp-campus-pin');
    if (temp) temp.remove();
  }

  function openAddPinModal() {
    const modal = document.getElementById('campus-map-add-modal');
    if (!modal) return;

    const titleInput = document.getElementById('pin-input-title');
    const memoInput = document.getElementById('pin-input-memo');
    if (titleInput) titleInput.value = '';
    if (memoInput) memoInput.value = '';

    selectCategoryOption('cleanup');

    const user = getCurrentUser();
    const authorEl = document.getElementById('pin-author-display');
    if (authorEl) authorEl.innerText = user.name;

    modal.classList.add('show');
  }

  function closeAddPinModal() {
    const modal = document.getElementById('campus-map-add-modal');
    if (modal) modal.classList.remove('show');
    clearTempMarker();
    pendingPinCoord = null;
    setPinMode(false);
  }

  function selectCategoryOption(catKey) {
    selectedCategory = catKey;
    document.querySelectorAll('.category-option-btn').forEach(btn => {
      if (btn.getAttribute('data-cat') === catKey) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // カテゴリごとの推奨掲載期間を自動選択
    const cat = PIN_CATEGORIES[catKey];
    const expirySelect = document.getElementById('pin-input-expiry');
    if (expirySelect && cat && cat.defaultDays) {
      expirySelect.value = String(cat.defaultDays);
    }
  }

  function submitPin() {
    if (!pendingPinCoord) {
      alert('マップ上の位置が選択されていません。');
      return;
    }

    const titleInput = document.getElementById('pin-input-title');
    const memoInput = document.getElementById('pin-input-memo');
    const expirySelect = document.getElementById('pin-input-expiry');

    const title = titleInput ? titleInput.value.trim() : '';
    const memo = memoInput ? memoInput.value.trim() : '';
    const catDef = PIN_CATEGORIES[selectedCategory] || PIN_CATEGORIES.cleanup;
    const expiryDays = (expirySelect && parseInt(expirySelect.value)) || (catDef.defaultDays || 7);

    if (!title) {
      alert('場所の名称またはピンのタイトルを入力してください。');
      if (titleInput) titleInput.focus();
      return;
    }

    const user = getCurrentUser();
    const pinId = 'pin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const now = Date.now();
    const expiresAt = now + (expiryDays * 24 * 60 * 60 * 1000);

    const newPin = {
      id: pinId,
      title: title,
      memo: memo,
      category: selectedCategory || 'cleanup',
      expiryDays: expiryDays,
      expiresAt: expiresAt,
      x: pendingPinCoord.x,
      y: pendingPinCoord.y,
      authorName: user.name,
      authorEmail: user.email,
      createdAt: now
    };

    savePinData(newPin);
    closeAddPinModal();
  }

  function savePinData(pin) {
    pinsData[pin.id] = pin;
    persistLocalStorage();
    renderPins();

    if (typeof firebase !== 'undefined' && firebase.database) {
      const db = firebase.database();
      db.ref('mirai_campus_pins/' + pin.id).set(pin)
        .then(() => {
          showToast('📍 ピンを設置しました！');
        })
        .catch(err => {
          console.warn('Firebase pin save error:', err);
          showToast('📍 ピンをローカルに保存しました');
        });
    } else {
      showToast('📍 ピンを保存しました');
    }
  }

  // 落とし物の解決処理（マップから消去）
  function resolvePin(pinId, pinTitle) {
    const title = pinTitle || 'この落とし物';
    if (!confirm(`「${title}」は解決しましたか？\n（落とし主が見つかった・職員室に届けた 等）\n\n解決済みとしてマップからピンを消去します。`)) {
      return;
    }

    delete pinsData[pinId];
    persistLocalStorage();
    renderPins();
    closePinDetailModal();

    if (typeof firebase !== 'undefined' && firebase.database) {
      firebase.database().ref('mirai_campus_pins/' + pinId).remove()
        .then(() => {
          showToast('🎉 落とし物が解決されました！マップから削除しました');
        })
        .catch(err => {
          console.warn('Firebase resolve error:', err);
        });
    } else {
      showToast('🎉 解決済みとして削除しました');
    }
  }

  function deletePin(pinId) {
    if (!confirm('このピンを削除しますか？')) return;

    delete pinsData[pinId];
    persistLocalStorage();
    renderPins();
    closePinDetailModal();

    if (typeof firebase !== 'undefined' && firebase.database) {
      firebase.database().ref('mirai_campus_pins/' + pinId).remove()
        .then(() => {
          showToast('ピンを削除しました');
        })
        .catch(err => {
          console.warn('Firebase pin delete error:', err);
        });
    }
  }

  // 期限切れピンの自動消去
  function cleanExpiredPins() {
    const now = Date.now();
    let hasExpired = false;

    for (const id in pinsData) {
      const pin = pinsData[id];
      if (!pin) continue;

      const catDef = PIN_CATEGORIES[pin.category] || PIN_CATEGORIES.cleanup;
      const expiryDays = pin.expiryDays || catDef.defaultDays || 7;
      const expiresAt = pin.expiresAt || ((pin.createdAt || now) + expiryDays * 24 * 60 * 60 * 1000);

      // 期限切れの場合
      if (now > expiresAt) {
        console.log(`期限切れピンを自動消去: ${pin.title} (${pin.id})`);
        delete pinsData[id];
        hasExpired = true;

        if (typeof firebase !== 'undefined' && firebase.database) {
          firebase.database().ref('mirai_campus_pins/' + id).remove().catch(e => console.warn(e));
        }
      }
    }

    if (hasExpired) {
      persistLocalStorage();
    }
  }

  // Firebase Realtime 同期（ピンデータ & マップ変更監視）
  function initFirebaseSync() {
    loadLocalStorage();
    renderPins();

    if (typeof firebase !== 'undefined' && firebase.database) {
      const db = firebase.database();

      // ピンのリアルタイム同期
      db.ref('mirai_campus_pins').on('value', snapshot => {
        const val = snapshot.val();
        if (val) {
          pinsData = val;
          persistLocalStorage();
        } else {
          if (Object.keys(pinsData).length === 0) {
            setupInitialDemoPins();
          }
        }
        renderPins();
      }, err => {
        console.warn('Firebase campus pins error:', err);
      });

      // マップ画像データの変更監視（他ユーザーがマップを更新した場合に自動反映）
      db.ref('mirai_campus_map').on('value', snapshot => {
        const val = snapshot.val();
        if (val && val.imageData && (!currentMapImage || currentMapImage.src !== val.imageData)) {
          console.log('Firebaseからマップの更新を受信しました');
          renderImageToCanvas(val.imageData, () => {
            saveMapToLocalStorage(val.imageData);
          });
        }
      });
    } else {
      if (Object.keys(pinsData).length === 0) {
        setupInitialDemoPins();
      }
      renderPins();
    }
  }

  function setupInitialDemoPins() {
    const demoPins = [
      {
        id: 'pin_demo_1',
        title: '中央広場前（ごみ箱設置場所）',
        memo: '分別ごみ箱が設置されています。いつも綺麗に保ちましょう！',
        category: 'cleanup',
        x: 48.5,
        y: 42.0,
        authorName: 'キャンパス美化委員',
        authorEmail: 'eco@campus.edu',
        createdAt: Date.now() - 3600000 * 24
      },
      {
        id: 'pin_demo_2',
        title: 'グラウンド東側 休憩ベンチ',
        memo: '木陰で風通しがよく、自習や読書におすすめのスポットです。',
        category: 'spot',
        x: 72.0,
        y: 65.0,
        authorName: '生徒会',
        authorEmail: 'council@campus.edu',
        createdAt: Date.now() - 3600000 * 48
      }
    ];

    demoPins.forEach(p => {
      pinsData[p.id] = p;
    });
    persistLocalStorage();
  }

  function persistLocalStorage() {
    try {
      localStorage.setItem(LOCAL_PINS_KEY, JSON.stringify(pinsData));
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }
  }

  function loadLocalStorage() {
    try {
      const stored = localStorage.getItem(LOCAL_PINS_KEY);
      if (stored) {
        pinsData = JSON.parse(stored) || {};
      }
    } catch (e) {
      pinsData = {};
    }
  }

  // ピンの描画
  function renderPins() {
    if (!overlayEl) return;

    // 期限切れピンの自動消去
    cleanExpiredPins();

    const existingPins = overlayEl.querySelectorAll('.campus-map-pin:not(#temp-campus-pin)');
    existingPins.forEach(el => el.remove());

    const pinsArray = Object.values(pinsData).filter(p => {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return false;
      if (currentFilter !== 'all' && p.category !== currentFilter) return false;
      return true;
    });

    const totalCount = Object.keys(pinsData).length;
    if (pinCountBadge) {
      pinCountBadge.innerText = `${totalCount}件のピン`;
    }

    pinsArray.forEach(pin => {
      const cat = PIN_CATEGORIES[pin.category] || PIN_CATEGORIES.spot;
      const pinEl = document.createElement('div');
      pinEl.className = 'campus-map-pin bounce';
      pinEl.style.left = pin.x + '%';
      pinEl.style.top = pin.y + '%';
      pinEl.setAttribute('data-pin-id', pin.id);

      pinEl.innerHTML = `
        <div class="pin-marker-body" style="filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45));">
          <svg viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.163 0 0 7.163 0 16C0 26.5 16 40 16 40C16 40 32 26.5 32 16C32 7.163 24.837 0 16 0Z" fill="${cat.color}"/>
            <circle cx="16" cy="15" r="9" fill="#ffffff"/>
          </svg>
          <span class="pin-marker-icon">${cat.icon}</span>
          <div class="pin-marker-pulse"></div>
        </div>
        <div class="pin-tooltip">${escapeHtml(pin.title)}</div>
      `;

      pinEl.addEventListener('click', e => {
        e.stopPropagation();
        openPinDetail(pin);
      });

      overlayEl.appendChild(pinEl);
    });

    renderPinList();
  }

  function renderPinList() {
    if (!pinListContainer) return;

    const allPins = Object.values(pinsData).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (allPins.length === 0) {
      pinListContainer.innerHTML = `
        <li style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.8125rem;">
          まだピンがありません。「📍 ピンを刺す」ボタンを押してマップ上にピンを立ててみましょう！
        </li>
      `;
      return;
    }

    let html = '';
    allPins.forEach(pin => {
      const cat = PIN_CATEGORIES[pin.category] || PIN_CATEGORIES.spot;
      const dateStr = pin.createdAt ? formatDate(pin.createdAt) : '';

      html += `
        <li class="campus-map-list-item" onclick="window.CampusMap.focusPin('${pin.id}')">
          <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0; flex: 1;">
            <span style="font-size: 1.25rem;">${cat.icon}</span>
            <div style="min-width: 0;">
              <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(pin.title)}
              </div>
              <div style="font-size: 0.725rem; color: var(--text-muted); display: flex; gap: 0.5rem;">
                <span style="color: ${cat.color}; font-weight: 600;">${cat.label}</span>
                <span>• ${escapeHtml(pin.authorName || 'ユーザー')}</span>
                <span>• ${dateStr}</span>
              </div>
            </div>
          </div>
          <button class="campus-map-btn" style="padding: 0.25rem 0.6rem; font-size: 0.725rem;" onclick="event.stopPropagation(); window.CampusMap.openPinDetailById('${pin.id}')">詳細</button>
        </li>
      `;
    });

    pinListContainer.innerHTML = html;
  }

  function openPinDetail(pin) {
    const modal = document.getElementById('campus-map-detail-modal');
    if (!modal) return;

    const cat = PIN_CATEGORIES[pin.category] || PIN_CATEGORIES.spot;
    const tagEl = document.getElementById('pin-detail-tag');
    const titleEl = document.getElementById('pin-detail-title');
    const bodyEl = document.getElementById('pin-detail-body');
    const authorEl = document.getElementById('pin-detail-author');
    const dateEl = document.getElementById('pin-detail-date');
    const deleteBtn = document.getElementById('btn-pin-delete');

    if (tagEl) {
      tagEl.innerHTML = `${cat.icon} ${cat.label}`;
      tagEl.style.backgroundColor = cat.bg;
      tagEl.style.color = cat.color;
      tagEl.style.border = `1px solid ${cat.border}`;
    }

    if (titleEl) titleEl.innerText = pin.title;
    if (bodyEl) {
      bodyEl.innerText = pin.memo || 'メモ・説明はありません。';
    }
    if (authorEl) authorEl.innerText = pin.authorName || '匿名ユーザー';
    if (dateEl) dateEl.innerText = pin.createdAt ? formatDate(pin.createdAt) : '';

    // 掲載期間・残り日数の計算と表示
    const expiryEl = document.getElementById('pin-detail-expiry');
    const now = Date.now();
    const expiryDays = pin.expiryDays || cat.defaultDays || 7;
    const expiresAt = pin.expiresAt || ((pin.createdAt || now) + expiryDays * 24 * 60 * 60 * 1000);
    const remainingMs = expiresAt - now;
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

    if (expiryEl) {
      if (pin.category === 'lost') {
        expiryEl.innerHTML = `<span style="color: #60a5fa;">落とし物（長期・あと ${remainingDays} 日）</span>`;
      } else {
        expiryEl.innerHTML = `<span>あと <strong>${remainingDays}</strong> 日で自動消去 (${formatDate(expiresAt).split(' ')[0]} まで)</span>`;
      }
    }

    // 落とし物ピンの解決バナー（誰でも解決可能）
    const resolveBanner = document.getElementById('pin-resolve-banner');
    const resolveBtn = document.getElementById('btn-pin-resolve');
    if (resolveBanner && resolveBtn) {
      if (pin.category === 'lost') {
        resolveBanner.style.display = 'block';
        resolveBtn.onclick = () => resolvePin(pin.id, pin.title);
      } else {
        resolveBanner.style.display = 'none';
      }
    }

    const user = getCurrentUser();
    const canDelete = (user.email === pin.authorEmail || user.name === pin.authorName || user.email === 'admin@mirai.local');
    if (deleteBtn) {
      deleteBtn.style.display = canDelete ? 'inline-flex' : 'none';
      deleteBtn.onclick = () => deletePin(pin.id);
    }

    modal.classList.add('show');
  }

  function closePinDetailModal() {
    const modal = document.getElementById('campus-map-detail-modal');
    if (modal) modal.classList.remove('show');
  }

  function focusPin(pinId) {
    const pin = pinsData[pinId];
    if (!pin) return;

    if (currentFilter !== 'all' && pin.category !== currentFilter) {
      setFilter('all');
    }

    const rect = viewportEl.getBoundingClientRect();
    const stageWidth = parseFloat(stageEl.style.width) || rect.width;
    const stageHeight = parseFloat(stageEl.style.height) || rect.height;

    scale = 1.6;
    const targetPx = (pin.x / 100) * stageWidth;
    const targetPy = (pin.y / 100) * stageHeight;

    panX = Math.round((rect.width / 2) - targetPx * scale);
    panY = Math.round((rect.height / 2) - targetPy * scale);

    applyTransform();

    viewportEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const pinEl = overlayEl.querySelector(`[data-pin-id="${pinId}"]`);
      if (pinEl) {
        pinEl.classList.remove('bounce');
        void pinEl.offsetWidth;
        pinEl.classList.add('bounce');
      }
    }, 300);
  }

  function setFilter(catKey) {
    currentFilter = catKey;
    document.querySelectorAll('.map-filter-chip').forEach(chip => {
      if (chip.getAttribute('data-filter') === catKey) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
    renderPins();
  }

  function setupEventListeners() {
    if (togglePinModeBtn) {
      togglePinModeBtn.addEventListener('click', togglePinMode);
    }

    const btnZoomIn = document.getElementById('btn-map-zoom-in');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => zoomBy(1.25));

    const btnZoomOut = document.getElementById('btn-map-zoom-out');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => zoomBy(0.8));

    const btnReset = document.getElementById('btn-map-reset');
    if (btnReset) btnReset.addEventListener('click', resetPanAndZoom);

    // ファイルアップロードボタン
    const uploadBtn = document.getElementById('btn-upload-map');
    if (uploadBtn && mapFileInput) {
      uploadBtn.addEventListener('click', () => mapFileInput.click());
      mapFileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
          handleFileSelected(e.target.files[0]);
        }
      });
    }

    // フィルターチップ
    if (filterChipsContainer) {
      filterChipsContainer.querySelectorAll('.map-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          setFilter(chip.getAttribute('data-filter'));
        });
      });
    }

    // カテゴリ選択
    document.querySelectorAll('.category-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectCategoryOption(btn.getAttribute('data-cat'));
      });
    });

    // モーダル
    const submitBtn = document.getElementById('btn-submit-pin');
    if (submitBtn) submitBtn.addEventListener('click', submitPin);

    const cancelBtn = document.getElementById('btn-cancel-pin');
    if (cancelBtn) cancelBtn.addEventListener('click', closeAddPinModal);

    const closeAddModalX = document.getElementById('btn-close-add-modal');
    if (closeAddModalX) closeAddModalX.addEventListener('click', closeAddPinModal);

    const closeDetailModalX = document.getElementById('btn-close-detail-modal');
    if (closeDetailModalX) closeDetailModalX.addEventListener('click', closePinDetailModal);

    window.addEventListener('click', e => {
      const addModal = document.getElementById('campus-map-add-modal');
      const detailModal = document.getElementById('campus-map-detail-modal');
      if (e.target === addModal) closeAddPinModal();
      if (e.target === detailModal) closePinDetailModal();
    });

    // アコーディオン
    const listHeader = document.getElementById('campus-map-list-header');
    const listWrapper = document.getElementById('campus-map-list-wrapper');
    const listToggleIcon = document.getElementById('campus-map-list-toggle-icon');
    if (listHeader && listWrapper) {
      listHeader.addEventListener('click', () => {
        const isHidden = listWrapper.style.display === 'none';
        listWrapper.style.display = isHidden ? 'block' : 'none';
        if (listToggleIcon) {
          listToggleIcon.innerText = isHidden ? '▲' : '▼';
        }
      });
    }
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.color = '#ffffff';
    toast.style.padding = '0.65rem 1.25rem';
    toast.style.borderRadius = '9999px';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.15)';
    toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.4)';
    toast.style.fontSize = '0.85rem';
    toast.style.fontWeight = '700';
    toast.style.zIndex = '9999';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.innerText = msg;

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    const m = d.getMonth() + 1;
    const date = d.getDate();
    const h = ('0' + d.getHours()).slice(-2);
    const min = ('0' + d.getMinutes()).slice(-2);
    return `${m}/${date} ${h}:${min}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.CampusMap = {
    init: initCampusMap,
    reload: startMapLoadingFlow,
    focusPin: focusPin,
    openPinDetailById: function (id) {
      if (pinsData[id]) openPinDetail(pinsData[id]);
    },
    togglePinMode: togglePinMode,
    resetView: resetPanAndZoom,
    loadCustomFile: handleFileSelected
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCampusMap);
  } else {
    initCampusMap();
  }
})();
