// OKRトラッカー メインアプリケーション
class OKRTracker {
    constructor() {
        this.okrs = [];
        this.history = [];
        this.currentView = 'dashboard';
        this.streak = 0;
        this.totalPoints = 0;
        this.lastUpdate = null;
        this.db = null;
        
        this.init();
    }

    async init() {
        await this.initDatabase();
        await this.loadData();
        this.setupEventListeners();
        this.updateDashboard();
        this.showView('dashboard');
    }

    // IndexedDB初期化
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('OKRTrackerDB', 2);
            
            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // OKRs store
                if (!db.objectStoreNames.contains('okrs')) {
                    const okrStore = db.createObjectStore('okrs', { keyPath: 'id' });
                    okrStore.createIndex('status', 'status', { unique: false });
                    okrStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
                
                // History store
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('date', 'date', { unique: false });
                }
                
                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                
                // Backups store
                if (!db.objectStoreNames.contains('backups')) {
                    const backupStore = db.createObjectStore('backups', { keyPath: 'id' });
                    backupStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    // データ管理（IndexedDB + localStorage フォールバック）
    async loadData() {
        try {
            if (this.db) {
                await this.loadFromIndexedDB();
            } else {
                this.loadFromLocalStorage();
            }
            this.updateStreak();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.loadFromLocalStorage(); // フォールバック
        }
    }

    async loadFromIndexedDB() {
        const transaction = this.db.transaction(['okrs', 'history', 'settings'], 'readonly');
        
        // OKRs読み込み
        const okrStore = transaction.objectStore('okrs');
        const okrRequest = okrStore.getAll();
        okrRequest.onsuccess = () => {
            this.okrs = okrRequest.result || [];
        };
        
        // History読み込み
        const historyStore = transaction.objectStore('history');
        const historyRequest = historyStore.getAll();
        historyRequest.onsuccess = () => {
            this.history = historyRequest.result || [];
        };
        
        // Settings読み込み
        const settingsStore = transaction.objectStore('settings');
        const streakRequest = settingsStore.get('streak');
        const pointsRequest = settingsStore.get('totalPoints');
        const lastUpdateRequest = settingsStore.get('lastUpdate');
        
        return new Promise((resolve) => {
            transaction.oncomplete = () => {
                streakRequest.onsuccess = () => {
                    this.streak = streakRequest.result?.value || 0;
                };
                pointsRequest.onsuccess = () => {
                    this.totalPoints = pointsRequest.result?.value || 0;
                };
                lastUpdateRequest.onsuccess = () => {
                    this.lastUpdate = lastUpdateRequest.result?.value ? new Date(lastUpdateRequest.result.value) : null;
                };
                resolve();
            };
        });
    }

    loadFromLocalStorage() {
        try {
            const data = localStorage.getItem('okr-tracker-data');
            if (data) {
                const parsed = JSON.parse(data);
                this.okrs = parsed.okrs || [];
                this.history = parsed.history || [];
                this.streak = parsed.streak || 0;
                this.totalPoints = parsed.totalPoints || 0;
                this.lastUpdate = parsed.lastUpdate ? new Date(parsed.lastUpdate) : null;
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }

    async saveData() {
        try {
            if (this.db) {
                await this.saveToIndexedDB();
            }
            this.saveToLocalStorage(); // 常にlocalStorageにも保存（バックアップ）
            
            // 自動バックアップ作成（週1回）
            await this.createAutoBackup();
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    async saveToIndexedDB() {
        const transaction = this.db.transaction(['okrs', 'history', 'settings'], 'readwrite');
        
        // OKRs保存
        const okrStore = transaction.objectStore('okrs');
        await okrStore.clear();
        this.okrs.forEach(okr => okrStore.add(okr));
        
        // History保存
        const historyStore = transaction.objectStore('history');
        await historyStore.clear();
        this.history.forEach(item => historyStore.add(item));
        
        // Settings保存
        const settingsStore = transaction.objectStore('settings');
        await settingsStore.put({ key: 'streak', value: this.streak });
        await settingsStore.put({ key: 'totalPoints', value: this.totalPoints });
        await settingsStore.put({ key: 'lastUpdate', value: new Date().toISOString() });
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    saveToLocalStorage() {
        try {
            const data = {
                okrs: this.okrs,
                history: this.history,
                streak: this.streak,
                totalPoints: this.totalPoints,
                lastUpdate: new Date().toISOString(),
                version: '1.0.0'
            };
            localStorage.setItem('okr-tracker-data', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    // 自動バックアップ作成
    async createAutoBackup() {
        try {
            const lastBackup = localStorage.getItem('okr-tracker-last-backup');
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            if (!lastBackup || new Date(lastBackup) < oneWeekAgo) {
                await this.createBackup(`auto_backup_${now.toISOString().split('T')[0]}`);
                localStorage.setItem('okr-tracker-last-backup', now.toISOString());
            }
        } catch (error) {
            console.error('Failed to create auto backup:', error);
        }
    }

    // 手動バックアップ作成
    async createBackup(name = null) {
        try {
            const backupName = name || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            const backupData = {
                id: this.generateId(),
                name: backupName,
                timestamp: new Date().toISOString(),
                data: {
                    okrs: this.okrs,
                    history: this.history,
                    streak: this.streak,
                    totalPoints: this.totalPoints,
                    version: '1.0.0'
                }
            };
            
            if (this.db) {
                const transaction = this.db.transaction(['backups'], 'readwrite');
                const store = transaction.objectStore('backups');
                await store.add(backupData);
                
                // 古いバックアップを削除（10個まで保持）
                const allBackups = await store.getAll();
                if (allBackups.length > 10) {
                    const sortedBackups = allBackups.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    const toDelete = sortedBackups.slice(0, allBackups.length - 10);
                    toDelete.forEach(backup => store.delete(backup.id));
                }
            }
            
            return backupData;
        } catch (error) {
            console.error('Failed to create backup:', error);
            throw error;
        }
    }

    // データエクスポート機能
    async exportData(format = 'json') {
        try {
            const exportData = {
                metadata: {
                    version: '1.0.0',
                    exportDate: new Date().toISOString(),
                    appName: 'OKRTracker'
                },
                data: {
                    okrs: this.okrs,
                    history: this.history,
                    settings: {
                        streak: this.streak,
                        totalPoints: this.totalPoints,
                        lastUpdate: this.lastUpdate
                    }
                }
            };

            let fileContent, fileName, mimeType;

            switch (format) {
                case 'json':
                    fileContent = JSON.stringify(exportData, null, 2);
                    fileName = `okr_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
                    mimeType = 'application/json';
                    break;
                
                case 'csv':
                    fileContent = this.convertToCSV(exportData.data);
                    fileName = `okr_tracker_data_${new Date().toISOString().split('T')[0]}.csv`;
                    mimeType = 'text/csv';
                    break;
                
                default:
                    throw new Error('Unsupported export format');
            }

            // ファイルダウンロード
            const blob = new Blob([fileContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // 成功ログ
            this.addToHistory('データエクスポート', `${format.toUpperCase()}形式でデータをエクスポートしました`);
            await this.saveData();
            
            return true;
        } catch (error) {
            console.error('Export failed:', error);
            alert('エクスポートに失敗しました: ' + error.message);
            return false;
        }
    }

    // CSV形式変換
    convertToCSV(data) {
        let csv = '';
        
        // OKRsをCSV形式に変換
        csv += 'Type,ID,Objective,Description,Status,StartDate,EndDate,KR_Description,KR_Target,KR_Current,KR_Unit,Progress\n';
        
        data.okrs.forEach(okr => {
            okr.keyResults.forEach(kr => {
                const progress = Math.round((kr.current / kr.target) * 100);
                csv += `OKR,"${okr.id}","${okr.objective}","${okr.description || ''}","${okr.status}","${okr.startDate}","${okr.endDate}","${kr.description}","${kr.target}","${kr.current}","${kr.unit || ''}","${progress}%"\n`;
            });
        });

        // 履歴をCSV形式に追加
        csv += '\nType,ID,Action,Description,Date,Progress\n';
        data.history.forEach(item => {
            csv += `History,"${item.id}","${item.action}","${item.description}","${item.date}","${item.progress || ''}"\n`;
        });

        return csv;
    }

    // データインポート機能
    async importData(file) {
        try {
            const fileContent = await this.readFile(file);
            let importData;

            if (file.name.endsWith('.json')) {
                importData = JSON.parse(fileContent);
            } else if (file.name.endsWith('.csv')) {
                importData = this.parseCSV(fileContent);
            } else {
                throw new Error('サポートされていないファイル形式です。JSONまたはCSVファイルを選択してください。');
            }

            // データ検証
            if (!this.validateImportData(importData)) {
                throw new Error('無効なデータ形式です。正しいOKRトラッカーのバックアップファイルを選択してください。');
            }

            // インポートオプションを表示
            return await this.showImportModal(importData);
        } catch (error) {
            console.error('Import failed:', error);
            alert('インポートに失敗しました: ' + error.message);
            return false;
        }
    }

    // ファイル読み込み
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    // データ検証
    validateImportData(data) {
        try {
            // JSON形式の場合
            if (data.data && data.metadata) {
                return data.data.okrs && Array.isArray(data.data.okrs);
            }
            // 直接データの場合
            return data.okrs && Array.isArray(data.okrs);
        } catch (error) {
            return false;
        }
    }

    // インポートモーダル表示
    async showImportModal(importData) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-content');
            const dataToImport = importData.data || importData;
            
            modal.innerHTML = `
                <h2 class="text-2xl font-bold text-gray-800 mb-6">データインポート</h2>
                
                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">インポート内容</h3>
                    <div class="bg-gray-50 rounded-lg p-4 space-y-2">
                        <p><strong>OKR数:</strong> ${dataToImport.okrs?.length || 0}個</p>
                        <p><strong>履歴数:</strong> ${dataToImport.history?.length || 0}件</p>
                        ${dataToImport.settings ? `<p><strong>ストリーク:</strong> ${dataToImport.settings.streak || 0}日</p>` : ''}
                        ${dataToImport.settings ? `<p><strong>ポイント:</strong> ${dataToImport.settings.totalPoints || 0}pt</p>` : ''}
                    </div>
                </div>

                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">インポート方法</h3>
                    <div class="space-y-3">
                        <label class="flex items-center space-x-3">
                            <input type="radio" name="import-method" value="replace" checked class="w-4 h-4 text-blue-600">
                            <span class="text-gray-700">
                                <strong>すべて置き換え</strong> - 現在のデータを削除してインポートデータに置き換えます
                            </span>
                        </label>
                        <label class="flex items-center space-x-3">
                            <input type="radio" name="import-method" value="merge" class="w-4 h-4 text-blue-600">
                            <span class="text-gray-700">
                                <strong>マージ</strong> - 現在のデータに追加します（重複は最新を保持）
                            </span>
                        </label>
                        <label class="flex items-center space-x-3">
                            <input type="radio" name="import-method" value="backup-and-replace" class="w-4 h-4 text-blue-600">
                            <span class="text-gray-700">
                                <strong>バックアップして置き換え</strong> - 現在のデータをバックアップしてから置き換えます
                            </span>
                        </label>
                    </div>
                </div>

                <div class="flex justify-end space-x-3">
                    <button type="button" onclick="okrTracker.closeModal(); okrTracker.resolveImport(false)" 
                            class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        キャンセル
                    </button>
                    <button type="button" onclick="okrTracker.executeImport()" 
                            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                        インポート実行
                    </button>
                </div>
            `;

            this.importData_resolve = resolve;
            this.importData_data = dataToImport;
            this.showModal();
        });
    }

    // インポート実行
    async executeImport() {
        try {
            const method = document.querySelector('input[name="import-method"]:checked').value;
            const dataToImport = this.importData_data;

            // バックアップ作成（必要に応じて）
            if (method === 'backup-and-replace') {
                await this.createBackup(`before_import_${new Date().toISOString().split('T')[0]}`);
            }

            // インポート実行
            switch (method) {
                case 'replace':
                case 'backup-and-replace':
                    this.okrs = dataToImport.okrs || [];
                    this.history = dataToImport.history || [];
                    if (dataToImport.settings) {
                        this.streak = dataToImport.settings.streak || 0;
                        this.totalPoints = dataToImport.settings.totalPoints || 0;
                        this.lastUpdate = dataToImport.settings.lastUpdate ? new Date(dataToImport.settings.lastUpdate) : null;
                    }
                    break;

                case 'merge':
                    // OKRsマージ（IDベースで重複チェック）
                    const existingOKRIds = new Set(this.okrs.map(okr => okr.id));
                    const newOKRs = (dataToImport.okrs || []).filter(okr => !existingOKRIds.has(okr.id));
                    this.okrs = [...this.okrs, ...newOKRs];

                    // 履歴マージ
                    const existingHistoryIds = new Set(this.history.map(item => item.id));
                    const newHistory = (dataToImport.history || []).filter(item => !existingHistoryIds.has(item.id));
                    this.history = [...this.history, ...newHistory];

                    // 設定は最大値を採用
                    if (dataToImport.settings) {
                        this.streak = Math.max(this.streak, dataToImport.settings.streak || 0);
                        this.totalPoints += dataToImport.settings.totalPoints || 0;
                    }
                    break;
            }

            // データ保存
            await this.saveData();

            // 履歴に記録
            this.addToHistory('データインポート', `${method}方式でデータをインポートしました`);

            // UI更新
            this.updateDashboard();
            this.updateOKRView();

            this.closeModal();
            this.resolveImport(true);

            alert('データのインポートが完了しました！');
        } catch (error) {
            console.error('Import execution failed:', error);
            alert('インポートの実行に失敗しました: ' + error.message);
            this.resolveImport(false);
        }
    }

    resolveImport(result) {
        if (this.importData_resolve) {
            this.importData_resolve(result);
            this.importData_resolve = null;
            this.importData_data = null;
        }
    }

    // バックアップリスト表示
    async showBackupManager() {
        try {
            let backups = [];
            if (this.db) {
                const transaction = this.db.transaction(['backups'], 'readonly');
                const store = transaction.objectStore('backups');
                const request = store.getAll();
                
                backups = await new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                });
            }

            const modal = document.getElementById('modal-content');
            modal.innerHTML = `
                <h2 class="text-2xl font-bold text-gray-800 mb-6">バックアップ管理</h2>
                
                <div class="mb-6">
                    <button onclick="okrTracker.createManualBackup()" 
                            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 mr-3">
                        新しいバックアップを作成
                    </button>
                    <button onclick="okrTracker.showExportOptions()" 
                            class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 mr-3">
                        エクスポート
                    </button>
                    <button onclick="okrTracker.showImportOptions()" 
                            class="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700">
                        インポート
                    </button>
                </div>

                <div class="max-h-96 overflow-y-auto">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">保存されたバックアップ</h3>
                    ${backups.length === 0 ? 
                        '<p class="text-gray-500 text-center py-8">バックアップがありません</p>' :
                        backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(backup => `
                            <div class="bg-gray-50 rounded-lg p-4 mb-3 flex justify-between items-center">
                                <div>
                                    <h4 class="font-semibold text-gray-800">${backup.name}</h4>
                                    <p class="text-sm text-gray-600">${new Date(backup.timestamp).toLocaleString('ja-JP')}</p>
                                    <p class="text-xs text-gray-500">
                                        OKR: ${backup.data.okrs?.length || 0}個, 
                                        履歴: ${backup.data.history?.length || 0}件
                                    </p>
                                </div>
                                <div class="space-x-2">
                                    <button onclick="okrTracker.restoreBackup('${backup.id}')" 
                                            class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
                                        復元
                                    </button>
                                    <button onclick="okrTracker.downloadBackup('${backup.id}')" 
                                            class="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600">
                                        ダウンロード
                                    </button>
                                    <button onclick="okrTracker.deleteBackup('${backup.id}')" 
                                            class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                                        削除
                                    </button>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>

                <div class="flex justify-end mt-6">
                    <button onclick="okrTracker.closeModal()" 
                            class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        閉じる
                    </button>
                </div>
            `;

            this.showModal();
        } catch (error) {
            console.error('Failed to show backup manager:', error);
            alert('バックアップ管理画面の表示に失敗しました');
        }
    }

    // 手動バックアップ作成
    async createManualBackup() {
        try {
            const name = prompt('バックアップ名を入力してください:', `manual_backup_${new Date().toISOString().split('T')[0]}`);
            if (!name) return;

            await this.createBackup(name);
            alert('バックアップを作成しました');
            this.showBackupManager(); // 再表示
        } catch (error) {
            console.error('Failed to create manual backup:', error);
            alert('バックアップの作成に失敗しました');
        }
    }

    // バックアップ復元
    async restoreBackup(backupId) {
        try {
            if (!confirm('現在のデータが上書きされます。バックアップから復元しますか？')) {
                return;
            }

            const transaction = this.db.transaction(['backups'], 'readonly');
            const store = transaction.objectStore('backups');
            const request = store.get(backupId);

            request.onsuccess = async () => {
                const backup = request.result;
                if (!backup) {
                    alert('バックアップが見つかりません');
                    return;
                }

                // 現在のデータをバックアップ
                await this.createBackup(`before_restore_${new Date().toISOString().split('T')[0]}`);

                // バックアップデータを復元
                this.okrs = backup.data.okrs || [];
                this.history = backup.data.history || [];
                this.streak = backup.data.streak || 0;
                this.totalPoints = backup.data.totalPoints || 0;
                this.lastUpdate = backup.data.lastUpdate ? new Date(backup.data.lastUpdate) : null;

                await this.saveData();
                this.addToHistory('バックアップ復元', `${backup.name}から復元しました`);

                // UI更新
                this.updateDashboard();
                this.updateOKRView();
                this.closeModal();

                alert('バックアップから復元しました');
            };
        } catch (error) {
            console.error('Failed to restore backup:', error);
            alert('バックアップの復元に失敗しました');
        }
    }

    // バックアップダウンロード
    async downloadBackup(backupId) {
        try {
            const transaction = this.db.transaction(['backups'], 'readonly');
            const store = transaction.objectStore('backups');
            const request = store.get(backupId);

            request.onsuccess = () => {
                const backup = request.result;
                if (!backup) {
                    alert('バックアップが見つかりません');
                    return;
                }

                const exportData = {
                    metadata: {
                        version: '1.0.0',
                        exportDate: backup.timestamp,
                        appName: 'OKRTracker',
                        backupName: backup.name
                    },
                    data: backup.data
                };

                const fileContent = JSON.stringify(exportData, null, 2);
                const blob = new Blob([fileContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${backup.name}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        } catch (error) {
            console.error('Failed to download backup:', error);
            alert('バックアップのダウンロードに失敗しました');
        }
    }

    // バックアップ削除
    async deleteBackup(backupId) {
        try {
            if (!confirm('このバックアップを削除しますか？')) {
                return;
            }

            const transaction = this.db.transaction(['backups'], 'readwrite');
            const store = transaction.objectStore('backups');
            await store.delete(backupId);

            alert('バックアップを削除しました');
            this.showBackupManager(); // 再表示
        } catch (error) {
            console.error('Failed to delete backup:', error);
            alert('バックアップの削除に失敗しました');
        }
    }

    // エクスポートオプション表示
    showExportOptions() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>データのエクスポート</h2>
                <div class="export-options">
                    <button class="export-json">
                        <i class="fas fa-file-code"></i>
                        JSON形式でエクスポート
                    </button>
                    <button class="export-csv">
                        <i class="fas fa-file-csv"></i>
                        CSV形式でエクスポート
                    </button>
                    <button class="export-backup">
                        <i class="fas fa-save"></i>
                        バックアップを作成
                    </button>
                </div>
                <div class="modal-footer">
                    <button class="close-modal">閉じる</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.showModal();

        // イベントリスナーの設定
        modal.querySelector('.export-json').addEventListener('click', () => {
            this.executeExport('json');
            this.closeModal();
        });

        modal.querySelector('.export-csv').addEventListener('click', () => {
            this.executeExport('csv');
            this.closeModal();
        });

        modal.querySelector('.export-backup').addEventListener('click', () => {
            this.createManualBackup();
            this.closeModal();
        });

        modal.querySelector('.close-modal').addEventListener('click', () => {
            this.closeModal();
        });
    }

    showImportOptions() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>データのインポート</h2>
                <div class="import-options">
                    <div class="file-import">
                        <label class="file-input-label">
                            <i class="fas fa-file-import"></i>
                            ファイルからインポート
                            <input type="file" accept=".json,.csv" style="display: none;">
                        </label>
                    </div>
                    <div class="backup-restore">
                        <button class="show-backups">
                            <i class="fas fa-history"></i>
                            バックアップから復元
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="close-modal">閉じる</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.showModal();

        // イベントリスナーの設定
        const fileInput = modal.querySelector('input[type="file"]');
        fileInput.addEventListener('change', (e) => {
            this.executeFileImport(e);
            this.closeModal();
        });

        modal.querySelector('.show-backups').addEventListener('click', () => {
            this.showBackupManager();
            this.closeModal();
        });

        modal.querySelector('.close-modal').addEventListener('click', () => {
            this.closeModal();
        });
    }

    // スタイルの追加
    // addStyles() {
    //     const style = document.createElement('style');
    //     style.textContent = `
    //         .export-options,
    //         .import-options {
    //             display: flex;
    //             flex-direction: column;
    //             gap: 15px;
    //             margin: 20px 0;
    //         }
    //
    //         .export-options button,
    //         .import-options button,
    //         .file-input-label {
    //             padding: 12px 20px;
    //             border: none;
    //             border-radius: 6px;
    //             background-color: #4a90e2;
    //             color: white;
    //             cursor: pointer;
    //             display: flex;
    //             align-items: center;
    //             gap: 10px;
    //             font-size: 16px;
    //             transition: all 0.2s;
    //         }
    //
    //         .export-options button:hover,
    //         .import-options button:hover,
    //         .file-input-label:hover {
    //             background-color: #357abd;
    //             transform: translateY(-2px);
    //         }
    //
    //         .file-input-label {
    //             justify-content: center;
    //         }
    //
    //         .modal-content {
    //             max-width: 500px;
    //             width: 90%;
    //         }
    //
    //         .notification {
    //             position: fixed;
    //             top: 20px;
    //             right: 20px;
    //             padding: 15px 25px;
    //             border-radius: 6px;
    //             color: white;
    //             z-index: 1000;
    //             animation: slideIn 0.3s ease-out;
    //             box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    //         }
    //
    //         .notification.success {
    //             background-color: #4caf50;
    //         }
    //
    //         .notification.error {
    //             background-color: #f44336;
    //         }
    //
    //         .notification.info {
    //             background-color: #2196f3;
    //         }
    //
    //         @keyframes slideIn {
    //             from {
    //                 transform: translateX(100%);
    //                 opacity: 0;
    //             }
    //             to {
    //                 transform: translateX(0);
    //                 opacity: 1;
    //             }
    //         }
    //     `;
    //     document.head.appendChild(style);
    // }

    // 通知を表示する関数
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // ビュー管理
    showView(viewName) {
        // 全てのビューを非表示
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        
        // 選択されたビューを表示
        document.getElementById(`${viewName}-view`).classList.remove('hidden');
        
        // ナビゲーションの状態更新
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('text-blue-600', 'font-semibold');
            link.classList.add('text-gray-600');
        });
        const navElement = document.getElementById(`nav-${viewName}`);
        if (navElement) {
            navElement.classList.add('text-blue-600', 'font-semibold');
        }
        
        this.currentView = viewName;
        
        // ビュー固有の更新処理
        switch(viewName) {
            case 'dashboard':
                this.updateDashboard();
                break;
            case 'okr':
                this.updateOKRView();
                break;
            case 'progress':
                this.updateProgressView();
                break;
            case 'reports':
                this.updateReportsView();
                break;
            case 'compare':
                this.updateCompareView();
                break;
        }
    }

    // ダッシュボード更新
    updateDashboard() {
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active').length;
        const avgProgress = this.calculateAverageProgress();
        
        document.getElementById('active-okrs').textContent = activeOKRs;
        document.getElementById('avg-progress').textContent = `${Math.round(avgProgress)}%`;
        document.getElementById('streak-days').textContent = `${this.streak}日`;
        document.getElementById('total-points').textContent = `${this.totalPoints}pt`;
        
        this.updateCurrentOKRsList();
    }

    // 現在のOKRリスト更新
    updateCurrentOKRsList() {
        const container = document.getElementById('current-okrs-list');
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active');
        
        if (activeOKRs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                    </svg>
                    <p class="text-lg">まだOKRが設定されていません</p>
                    <p class="text-sm mt-2">「OKRを始める」ボタンから目標を設定しましょう</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = activeOKRs.map(okr => this.renderOKRCard(okr)).join('');
    }

    // OKRカードレンダリング
    renderOKRCard(okr) {
        const progress = this.calculateOKRProgress(okr);
        const progressColor = progress >= 75 ? 'green' : progress >= 50 ? 'yellow' : progress >= 25 ? 'orange' : 'red';
        
        return `
            <div class="border border-gray-200 rounded-lg p-6 card-hover">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h4 class="text-lg font-semibold text-gray-800 mb-2">${okr.objective}</h4>
                        <p class="text-sm text-gray-600">${okr.description || ''}</p>
                        <p class="text-xs text-gray-500 mt-1">期間: ${new Date(okr.startDate).toLocaleDateString()} - ${new Date(okr.endDate).toLocaleDateString()}</p>
                    </div>
                    <div class="ml-4 text-right">
                        <div class="text-2xl font-bold text-${progressColor}-600">${Math.round(progress)}%</div>
                        <div class="text-xs text-gray-500">達成率</div>
                    </div>
                </div>
                
                <div class="mb-4">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-${progressColor}-600 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                </div>
                
                <div class="space-y-2">
                    <h5 class="text-sm font-semibold text-gray-700">Key Results:</h5>
                    ${okr.keyResults.map(kr => `
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600">${kr.description}</span>
                            <span class="font-medium">${kr.current}/${kr.target} (${Math.round((kr.current/kr.target)*100)}%)</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="flex justify-end mt-4 space-x-2">
                    <button onclick="okrTracker.editOKR('${okr.id}')" class="text-blue-600 hover:text-blue-800 text-sm">編集</button>
                    <button onclick="okrTracker.updateProgress('${okr.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">進捗更新</button>
                </div>
            </div>
        `;
    }

    // ユーティリティ関数
    calculateOKRProgress(okr) {
        if (!okr.keyResults || okr.keyResults.length === 0) return 0;
        
        const totalProgress = okr.keyResults.reduce((sum, kr) => {
            return sum + (kr.current / kr.target) * 100;
        }, 0);
        
        return Math.min(totalProgress / okr.keyResults.length, 100);
    }

    calculateAverageProgress() {
        if (this.okrs.length === 0) return 0;
        
        const totalProgress = this.okrs.reduce((sum, okr) => {
            return sum + this.calculateOKRProgress(okr);
        }, 0);
        
        return totalProgress / this.okrs.length;
    }

    updateStreak() {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (!this.lastUpdate) {
            this.streak = 0;
            return;
        }
        
        const lastUpdateDate = new Date(this.lastUpdate);
        const daysDiff = Math.floor((today - lastUpdateDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
            // 今日既に更新済み - ストリーク維持
        } else if (daysDiff === 1) {
            // 昨日更新 - ストリーク継続
            this.streak++;
        } else {
            // 1日以上空いた - ストリークリセット
            this.streak = 0;
        }
    }

    generateId() {
        return 'okr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    addToHistory(action, description, progress = null) {
        this.history.push({
            id: this.generateId(),
            action,
            description,
            progress,
            date: new Date().toISOString()
        });
    }

    showModal() {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-overlay').classList.add('flex');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-overlay').classList.remove('flex');
    }

    // 基本的なOKR管理機能（簡略版）
    showAddOKRModal() {
        const modal = document.getElementById('modal-content');
        modal.innerHTML = `
            <h2 class="text-2xl font-bold text-gray-800 mb-6">新しいOKRを作成</h2>
            <form id="add-okr-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Objective（目標）</label>
                    <input type="text" id="objective" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="例：売上を向上させる">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">説明（任意）</label>
                    <textarea id="description" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="3" placeholder="目標の詳細説明"></textarea>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">開始日</label>
                        <input type="date" id="start-date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">終了日</label>
                        <input type="date" id="end-date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                </div>
                
                <div class="flex justify-end space-x-3 pt-6">
                    <button type="button" onclick="okrTracker.closeModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800">キャンセル</button>
                    <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">作成</button>
                </div>
            </form>
        `;
        
        // 今日の日付をデフォルトに設定
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('start-date').value = today;
        
        // 3ヶ月後をデフォルト終了日に設定
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 3);
        document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
        
        document.getElementById('add-okr-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createBasicOKR();
        });
        
        this.showModal();
    }

    createBasicOKR() {
        const form = document.getElementById('add-okr-form');
        const formData = new FormData(form);
        
        const okr = {
            id: this.generateId(),
            objective: formData.get('objective'),
            description: formData.get('description'),
            startDate: formData.get('start-date'),
            endDate: formData.get('end-date'),
            keyResults: [
                {
                    description: '基本的な進捗指標',
                    target: 100,
                    current: 0,
                    unit: '%'
                }
            ],
            status: 'active',
            createdAt: new Date().toISOString()
        };
        
        this.okrs.push(okr);
        this.addToHistory('OKR作成', `「${okr.objective}」を作成しました`);
        this.saveData();
        this.closeModal();
        this.updateDashboard();
        alert('OKRを作成しました！詳細な設定は「OKR管理」ページで行えます。');
    }

    // 基本的なビュー更新（簡略版）
    updateOKRView() {
        const container = document.getElementById('okr-list');
        if (!container) return;
        
        if (this.okrs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    <p class="text-lg">OKRを追加して始めましょう</p>
                    <button onclick="okrTracker.showAddOKRModal()" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">最初のOKRを作成</button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.okrs.map(okr => this.renderOKRCard(okr)).join('');
    }

    updateProgressView() {
        // 基本的な進捗ビュー更新
        const container = document.getElementById('progress-update-content');
        if (!container) return;
        
        container.innerHTML = `
            <div class="text-center py-12">
                <p class="text-lg text-gray-600">進捗更新機能は「OKR管理」ページから行えます</p>
                <button onclick="okrTracker.showView('okr')" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">OKR管理へ</button>
            </div>
        `;
    }

    updateReportsView() {
        // 基本的なレポートビュー更新
    }

    updateCompareView() {
        // 基本的な比較ビュー更新
    }

    // SNSシェア機能
    shareResults() {
        const avgProgress = Math.round(this.calculateAverageProgress());
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active').length;
        
        const text = `📊 私のOKR進捗状況
        
🎯 アクティブOKR: ${activeOKRs}個
📈 平均達成率: ${avgProgress}%
🔥 連続更新: ${this.streak}日
⭐ 獲得ポイント: ${this.totalPoints}pt

目標達成に向けて着実に進歩中！

#継続は力なり #OKR #目標達成 #生産性向上 #無料ツール

https://appadaycreator.github.io/okr-tracker/`;
        
        if (navigator.share) {
            navigator.share({
                title: 'OKRトラッカー - 私の進捗',
                text: text,
                url: 'https://appadaycreator.github.io/okr-tracker/'
            });
        } else {
            // フォールバック: クリップボードにコピー
            navigator.clipboard.writeText(text).then(() => {
                alert('シェア用テキストをクリップボードにコピーしました！');
            });
        }
    }

    // 友達と比較機能（基本版）
    generateShareCode() {
        const data = {
            totalOKRs: this.okrs.length,
            activeOKRs: this.okrs.filter(okr => okr.status === 'active').length,
            avgProgress: Math.round(this.calculateAverageProgress()),
            streak: this.streak,
            totalPoints: this.totalPoints,
            timestamp: new Date().toISOString()
        };
        
        const shareCode = btoa(JSON.stringify(data));
        document.getElementById('share-code').textContent = shareCode;
        document.getElementById('share-code-display').classList.remove('hidden');
    }

    copyShareCode() {
        const shareCode = document.getElementById('share-code').textContent;
        navigator.clipboard.writeText(shareCode).then(() => {
            alert('共有コードをコピーしました！');
        });
    }

    importFriendData() {
        const code = prompt('友達の共有コードを入力してください：');
        if (!code) return;
        
        try {
            const friendData = JSON.parse(atob(code));
            alert('友達のデータを読み込みました！比較機能は今後のアップデートで実装予定です。');
        } catch (error) {
            alert('無効な共有コードです。');
        }
    }

    updateProgress(okrId) {
        this.showView('progress');
    }

    // アフィリエイトリンク設定
    setupAffiliateLinks() {
        // Amazon Associates
        const amazonLinks = {
            'affiliate-book-1': 'https://amzn.to/OKR-book-1', // 実際のアフィリエイトリンクに置き換え
            'affiliate-book-2': 'https://amzn.to/high-output-management',
            'affiliate-book-3': 'https://amzn.to/goal-achievement-tech'
        };

        Object.entries(amazonLinks).forEach(([id, url]) => {
            const element = document.getElementById(id);
            if (element) {
                element.href = url;
                element.target = '_blank';
                element.rel = 'noopener noreferrer';
            }
        });
    }

    // ビュー管理
    showView(viewName) {
        // 全てのビューを非表示
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        
        // 選択されたビューを表示
        document.getElementById(`${viewName}-view`).classList.remove('hidden');
        
        // ナビゲーションの状態更新
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('text-blue-600', 'font-semibold');
            link.classList.add('text-gray-600');
        });
        document.getElementById(`nav-${viewName}`).classList.add('text-blue-600', 'font-semibold');
        
        this.currentView = viewName;
        
        // ビュー固有の更新処理
        switch(viewName) {
            case 'dashboard':
                this.updateDashboard();
                break;
            case 'okr':
                this.updateOKRView();
                break;
            case 'progress':
                this.updateProgressView();
                break;
            case 'reports':
                this.updateReportsView();
                break;
            case 'compare':
                this.updateCompareView();
                break;
        }
    }

    // ダッシュボード更新
    updateDashboard() {
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active').length;
        const avgProgress = this.calculateAverageProgress();
        
        document.getElementById('active-okrs').textContent = activeOKRs;
        document.getElementById('avg-progress').textContent = `${Math.round(avgProgress)}%`;
        document.getElementById('streak-days').textContent = `${this.streak}日`;
        document.getElementById('total-points').textContent = `${this.totalPoints}pt`;
        
        this.updateCurrentOKRsList();
    }

    // 現在のOKRリスト更新
    updateCurrentOKRsList() {
        const container = document.getElementById('current-okrs-list');
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active');
        
        if (activeOKRs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                    </svg>
                    <p class="text-lg">まだOKRが設定されていません</p>
                    <p class="text-sm mt-2">「OKRを始める」ボタンから目標を設定しましょう</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = activeOKRs.map(okr => this.renderOKRCard(okr)).join('');
    }

    // OKRカードレンダリング
    renderOKRCard(okr) {
        const progress = this.calculateOKRProgress(okr);
        const progressColor = progress >= 75 ? 'green' : progress >= 50 ? 'yellow' : progress >= 25 ? 'orange' : 'red';
        
        return `
            <div class="border border-gray-200 rounded-lg p-6 card-hover">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h4 class="text-lg font-semibold text-gray-800 mb-2">${okr.objective}</h4>
                        <p class="text-sm text-gray-600">${okr.description || ''}</p>
                        <p class="text-xs text-gray-500 mt-1">期間: ${new Date(okr.startDate).toLocaleDateString()} - ${new Date(okr.endDate).toLocaleDateString()}</p>
                    </div>
                    <div class="ml-4 text-right">
                        <div class="text-2xl font-bold text-${progressColor}-600">${Math.round(progress)}%</div>
                        <div class="text-xs text-gray-500">達成率</div>
                    </div>
                </div>
                
                <div class="mb-4">
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-${progressColor}-600 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                </div>
                
                <div class="space-y-2">
                    <h5 class="text-sm font-semibold text-gray-700">Key Results:</h5>
                    ${okr.keyResults.map(kr => `
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-600">${kr.description}</span>
                            <span class="font-medium">${kr.current}/${kr.target} (${Math.round((kr.current/kr.target)*100)}%)</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="flex justify-end mt-4 space-x-2">
                    <button onclick="okrTracker.editOKR('${okr.id}')" class="text-blue-600 hover:text-blue-800 text-sm">編集</button>
                    <button onclick="okrTracker.updateProgress('${okr.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">進捗更新</button>
                </div>
            </div>
        `;
    }

    // OKRビュー更新
    updateOKRView() {
        const container = document.getElementById('okr-list');
        
        if (this.okrs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    <p class="text-lg">OKRを追加して始めましょう</p>
                    <button onclick="okrTracker.showAddOKRModal()" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">最初のOKRを作成</button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.okrs.map(okr => this.renderDetailedOKRCard(okr)).join('');
    }

    // 詳細OKRカードレンダリング
    renderDetailedOKRCard(okr) {
        const progress = this.calculateOKRProgress(okr);
        const statusColors = {
            'active': 'green',
            'completed': 'blue',
            'paused': 'yellow',
            'cancelled': 'red'
        };
        const statusColor = statusColors[okr.status] || 'gray';
        
        return `
            <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div class="flex justify-between items-start mb-6">
                    <div class="flex-1">
                        <div class="flex items-center space-x-3 mb-2">
                            <h3 class="text-xl font-bold text-gray-800">${okr.objective}</h3>
                            <span class="px-2 py-1 text-xs font-medium bg-${statusColor}-100 text-${statusColor}-800 rounded-full">
                                ${this.getStatusLabel(okr.status)}
                            </span>
                        </div>
                        <p class="text-gray-600 mb-2">${okr.description || ''}</p>
                        <p class="text-sm text-gray-500">
                            期間: ${new Date(okr.startDate).toLocaleDateString()} - ${new Date(okr.endDate).toLocaleDateString()}
                        </p>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl font-bold text-blue-600">${Math.round(progress)}%</div>
                        <div class="text-sm text-gray-500">全体達成率</div>
                    </div>
                </div>
                
                <div class="mb-6">
                    <div class="w-full bg-gray-200 rounded-full h-3">
                        <div class="bg-blue-600 h-3 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                </div>
                
                <div class="space-y-4 mb-6">
                    <h4 class="text-lg font-semibold text-gray-800">Key Results</h4>
                    ${okr.keyResults.map((kr, index) => this.renderKeyResult(kr, index, okr.id)).join('')}
                </div>
                
                <div class="flex justify-end space-x-3">
                    <button onclick="okrTracker.editOKR('${okr.id}')" class="text-gray-600 hover:text-gray-800">
                        <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        編集
                    </button>
                    <button onclick="okrTracker.updateProgress('${okr.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                        進捗更新
                    </button>
                    <button onclick="okrTracker.deleteOKR('${okr.id}')" class="text-red-600 hover:text-red-800">
                        <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        削除
                    </button>
                </div>
            </div>
        `;
    }

    // Key Result レンダリング
    renderKeyResult(kr, index, okrId) {
        const progress = (kr.current / kr.target) * 100;
        const progressColor = progress >= 100 ? 'green' : progress >= 75 ? 'blue' : progress >= 50 ? 'yellow' : 'red';
        
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <h5 class="font-medium text-gray-800">${kr.description}</h5>
                        <p class="text-sm text-gray-600 mt-1">${kr.unit ? `単位: ${kr.unit}` : ''}</p>
                    </div>
                    <div class="text-right ml-4">
                        <div class="text-lg font-bold text-${progressColor}-600">${Math.round(progress)}%</div>
                        <div class="text-sm text-gray-500">${kr.current}/${kr.target}</div>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div class="bg-${progressColor}-600 h-2 rounded-full transition-all duration-500" style="width: ${Math.min(progress, 100)}%"></div>
                </div>
                <button onclick="okrTracker.updateKeyResult('${okrId}', ${index})" class="text-blue-600 hover:text-blue-800 text-sm">
                    値を更新
                </button>
            </div>
        `;
    }

    // 進捗ビュー更新
    updateProgressView() {
        const container = document.getElementById('progress-update-content');
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active');
        
        if (activeOKRs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <p class="text-lg">アクティブなOKRがありません</p>
                    <button onclick="okrTracker.showView('okr')" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">OKRを作成</button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="space-y-6">
                ${activeOKRs.map(okr => `
                    <div class="bg-white rounded-xl p-6 shadow-sm">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">${okr.objective}</h3>
                        <div class="space-y-4">
                            ${okr.keyResults.map((kr, index) => `
                                <div class="border border-gray-200 rounded-lg p-4">
                                    <div class="flex justify-between items-center mb-3">
                                        <h4 class="font-medium text-gray-800">${kr.description}</h4>
                                        <span class="text-sm text-gray-500">${kr.current}/${kr.target} ${kr.unit || ''}</span>
                                    </div>
                                    <div class="flex items-center space-x-3">
                                        <input type="number" 
                                               id="kr-input-${okr.id}-${index}" 
                                               value="${kr.current}" 
                                               min="0" 
                                               max="${kr.target}"
                                               class="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                        <button onclick="okrTracker.saveKeyResultUpdate('${okr.id}', ${index})" 
                                                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                                            更新
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // レポートビュー更新
    updateReportsView() {
        this.renderProgressChart();
        this.renderAchievementChart();
        this.updateHistoryList();
    }

    // 進捗チャート描画
    renderProgressChart() {
        const ctx = document.getElementById('progress-chart').getContext('2d');
        
        // 過去30日間のデータを生成
        const dates = [];
        const progressData = [];
        const today = new Date();
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            dates.push(date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }));
            
            // 履歴から該当日の平均進捗を計算
            const dayHistory = this.history.filter(h => {
                const historyDate = new Date(h.date);
                return historyDate.toDateString() === date.toDateString();
            });
            
            const avgProgress = dayHistory.length > 0 
                ? dayHistory.reduce((sum, h) => sum + h.progress, 0) / dayHistory.length 
                : this.calculateAverageProgress();
                
            progressData.push(avgProgress);
        }
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: '平均進捗率',
                    data: progressData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    // 達成率分布チャート描画
    renderAchievementChart() {
        const ctx = document.getElementById('achievement-chart').getContext('2d');
        
        // OKRの達成率を区分けして集計
        const ranges = ['0-25%', '26-50%', '51-75%', '76-100%'];
        const counts = [0, 0, 0, 0];
        
        this.okrs.forEach(okr => {
            const progress = this.calculateOKRProgress(okr);
            if (progress <= 25) counts[0]++;
            else if (progress <= 50) counts[1]++;
            else if (progress <= 75) counts[2]++;
            else counts[3]++;
        });
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ranges,
                datasets: [{
                    data: counts,
                    backgroundColor: [
                        '#ef4444',
                        '#f59e0b',
                        '#3b82f6',
                        '#10b981'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // 履歴リスト更新
    updateHistoryList() {
        const container = document.getElementById('history-list');
        const recentHistory = this.history.slice(-10).reverse();
        
        if (recentHistory.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>まだ履歴がありません</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = recentHistory.map(item => `
            <div class="flex justify-between items-center py-3 border-b border-gray-200 last:border-b-0">
                <div>
                    <p class="font-medium text-gray-800">${item.action}</p>
                    <p class="text-sm text-gray-600">${item.description}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm text-gray-500">${new Date(item.date).toLocaleDateString()}</p>
                    <p class="text-sm font-medium text-gray-800">${item.progress ? Math.round(item.progress) + '%' : ''}</p>
                </div>
            </div>
        `).join('');
    }

    // 比較ビュー更新
    updateCompareView() {
        // 比較結果の表示処理
    }

    // ユーティリティ関数
    calculateOKRProgress(okr) {
        if (!okr.keyResults || okr.keyResults.length === 0) return 0;
        
        const totalProgress = okr.keyResults.reduce((sum, kr) => {
            return sum + (kr.current / kr.target) * 100;
        }, 0);
        
        return Math.min(totalProgress / okr.keyResults.length, 100);
    }

    calculateAverageProgress() {
        if (this.okrs.length === 0) return 0;
        
        const totalProgress = this.okrs.reduce((sum, okr) => {
            return sum + this.calculateOKRProgress(okr);
        }, 0);
        
        return totalProgress / this.okrs.length;
    }

    updateStreak() {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (!this.lastUpdate) {
            this.streak = 0;
            return;
        }
        
        const lastUpdateDate = new Date(this.lastUpdate);
        const daysDiff = Math.floor((today - lastUpdateDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
            // 今日既に更新済み - ストリーク維持
        } else if (daysDiff === 1) {
            // 昨日更新 - ストリーク継続
            this.streak++;
        } else {
            // 1日以上空いた - ストリークリセット
            this.streak = 0;
        }
    }

    getStatusLabel(status) {
        const labels = {
            'active': 'アクティブ',
            'completed': '完了',
            'paused': '一時停止',
            'cancelled': 'キャンセル'
        };
        return labels[status] || status;
    }

    // モーダル関連
    showAddOKRModal() {
        const modal = document.getElementById('modal-content');
        modal.innerHTML = `
            <h2 class="text-2xl font-bold text-gray-800 mb-6">新しいOKRを作成</h2>
            <form id="add-okr-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Objective（目標）</label>
                    <input type="text" id="objective" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="例：売上を向上させる">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">説明（任意）</label>
                    <textarea id="description" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="3" placeholder="目標の詳細説明"></textarea>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">開始日</label>
                        <input type="date" id="start-date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">終了日</label>
                        <input type="date" id="end-date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Key Results</label>
                    <div id="key-results-container" class="space-y-3">
                        ${this.renderKeyResultInput(0)}
                        ${this.renderKeyResultInput(1)}
                    </div>
                    <button type="button" id="add-kr-btn" class="mt-2 text-blue-600 hover:text-blue-800 text-sm">+ Key Resultを追加</button>
                </div>
                
                <div class="flex justify-end space-x-3 pt-6">
                    <button type="button" onclick="okrTracker.closeModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800">キャンセル</button>
                    <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">作成</button>
                </div>
            </form>
        `;
        
        // 今日の日付をデフォルトに設定
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('start-date').value = today;
        
        // 3ヶ月後をデフォルト終了日に設定
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 3);
        document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
        
        // イベントリスナー設定
        document.getElementById('add-kr-btn').addEventListener('click', () => {
            const container = document.getElementById('key-results-container');
            const count = container.children.length;
            if (count < 5) {
                container.insertAdjacentHTML('beforeend', this.renderKeyResultInput(count));
            }
        });
        
        document.getElementById('add-okr-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createOKR();
        });
        
        this.showModal();
    }

    renderKeyResultInput(index, kr = {}) {
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="grid grid-cols-1 gap-3">
                    <input type="text" name="kr-description-${index}" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Key Result ${index + 1}の説明" value="${kr.description || ''}">
                    <div class="grid grid-cols-3 gap-2">
                        <input type="number" name="kr-target-${index}" required min="1" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="目標値" value="${kr.target ?? ''}">
                        <input type="text" name="kr-unit-${index}" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="単位" value="${kr.unit || ''}">
                        <input type="number" name="kr-current-${index}" min="0" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="現在値" value="${kr.current ?? 0}">
                    </div>
                </div>
                ${index >= 2 ? `<button type="button" onclick="this.parentElement.remove()" class="mt-2 text-red-600 hover:text-red-800 text-sm">削除</button>` : ''}
            </div>
        `;
    }

    createOKR() {
        const form = document.getElementById('add-okr-form');
        const formData = new FormData(form);
        
        // Key Resultsを収集
        const keyResults = [];
        let index = 0;
        while (formData.get(`kr-description-${index}`)) {
            keyResults.push({
                description: formData.get(`kr-description-${index}`),
                target: parseFloat(formData.get(`kr-target-${index}`)),
                current: parseFloat(formData.get(`kr-current-${index}`) || 0),
                unit: formData.get(`kr-unit-${index}`) || ''
            });
            index++;
        }
        
        const okr = {
            id: this.generateId(),
            objective: formData.get('objective'),
            description: formData.get('description'),
            startDate: formData.get('start-date'),
            endDate: formData.get('end-date'),
            keyResults: keyResults,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        
        this.okrs.push(okr);
        this.addToHistory('OKR作成', `「${okr.objective}」を作成しました`);
        this.saveData();
        this.closeModal();
        this.updateDashboard();
        this.updateOKRView();
    }

    // Key Result更新
    updateKeyResult(okrId, krIndex) {
        const okr = this.okrs.find(o => o.id === okrId);
        if (!okr) return;
        
        const kr = okr.keyResults[krIndex];
        const modal = document.getElementById('modal-content');
        
        modal.innerHTML = `
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Key Result更新</h2>
            <div class="mb-4">
                <h3 class="text-lg font-semibold text-gray-800">${okr.objective}</h3>
                <p class="text-gray-600">${kr.description}</p>
            </div>
            <form id="update-kr-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">現在の値</label>
                    <div class="flex items-center space-x-2">
                        <input type="number" id="current-value" value="${kr.current}" min="0" max="${kr.target}" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <span class="text-gray-500">/ ${kr.target} ${kr.unit}</span>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">進捗メモ（任意）</label>
                    <textarea id="progress-memo" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="3" placeholder="今回の更新について..."></textarea>
                </div>
                <div class="flex justify-end space-x-3 pt-6">
                    <button type="button" onclick="okrTracker.closeModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800">キャンセル</button>
                    <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">更新</button>
                </div>
            </form>
        `;
        
        document.getElementById('update-kr-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const newValue = parseFloat(document.getElementById('current-value').value);
            const memo = document.getElementById('progress-memo').value;
            
            kr.current = newValue;
            
            const progress = (newValue / kr.target) * 100;
            this.addToHistory(
                'KR更新', 
                `「${kr.description}」を${kr.current}/${kr.target}に更新`,
                progress
            );
            
            // ポイント付与
            if (newValue > 0) {
                this.totalPoints += 10;
            }
            if (progress >= 100) {
                this.totalPoints += 50;
            }
            
            this.lastUpdate = new Date();
            this.updateStreak();
            this.saveData();
            this.closeModal();
            this.updateDashboard();
            this.updateOKRView();
        });
        
        this.showModal();
    }

    saveKeyResultUpdate(okrId, krIndex) {
        const input = document.getElementById(`kr-input-${okrId}-${krIndex}`);
        const newValue = parseFloat(input.value);
        
        const okr = this.okrs.find(o => o.id === okrId);
        if (!okr) return;
        
        const kr = okr.keyResults[krIndex];
        kr.current = newValue;
        
        this.addToHistory(
            'KR更新', 
            `「${kr.description}」を${kr.current}/${kr.target}に更新`,
            (newValue / kr.target) * 100
        );
        
        // ポイント付与
        this.totalPoints += 10;
        if ((newValue / kr.target) >= 1) {
            this.totalPoints += 50;
        }
        
        this.lastUpdate = new Date();
        this.updateStreak();
        this.saveData();
        this.updateDashboard();
        this.updateProgressView();
    }

    // SNSシェア機能
    shareResults() {
        const avgProgress = Math.round(this.calculateAverageProgress());
        const activeOKRs = this.okrs.filter(okr => okr.status === 'active').length;
        
        const text = `📊 私のOKR進捗状況
        
🎯 アクティブOKR: ${activeOKRs}個
📈 平均達成率: ${avgProgress}%
🔥 連続更新: ${this.streak}日
⭐ 獲得ポイント: ${this.totalPoints}pt

目標達成に向けて着実に進歩中！

#継続は力なり #OKR #目標達成 #生産性向上 #無料ツール

https://appadaycreator.github.io/okr-tracker/`;
        
        if (navigator.share) {
            navigator.share({
                title: 'OKRトラッカー - 私の進捗',
                text: text,
                url: 'https://appadaycreator.github.io/okr-tracker/'
            });
        } else {
            // フォールバック: クリップボードにコピー
            navigator.clipboard.writeText(text).then(() => {
                alert('シェア用テキストをクリップボードにコピーしました！');
            });
        }
    }

    // 友達と比較機能
    generateShareCode() {
        const data = {
            totalOKRs: this.okrs.length,
            activeOKRs: this.okrs.filter(okr => okr.status === 'active').length,
            avgProgress: Math.round(this.calculateAverageProgress()),
            streak: this.streak,
            totalPoints: this.totalPoints,
            timestamp: new Date().toISOString()
        };
        
        const shareCode = btoa(JSON.stringify(data));
        document.getElementById('share-code').textContent = shareCode;
        document.getElementById('share-code-display').classList.remove('hidden');
    }

    copyShareCode() {
        const shareCode = document.getElementById('share-code').textContent;
        navigator.clipboard.writeText(shareCode).then(() => {
            alert('共有コードをコピーしました！');
        });
    }

    importFriendData() {
        const code = prompt('友達の共有コードを入力してください：');
        if (!code) return;
        
        try {
            const friendData = JSON.parse(atob(code));
            this.showComparisonResults(friendData);
        } catch (error) {
            alert('無効な共有コードです。');
        }
    }

    showComparisonResults(friendData) {
        const myData = {
            totalOKRs: this.okrs.length,
            activeOKRs: this.okrs.filter(okr => okr.status === 'active').length,
            avgProgress: Math.round(this.calculateAverageProgress()),
            streak: this.streak,
            totalPoints: this.totalPoints
        };
        
        const container = document.getElementById('comparison-results');
        container.innerHTML = `
            <div class="bg-white rounded-xl p-6 shadow-sm">
                <h3 class="text-xl font-bold text-gray-800 mb-6">比較結果</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="text-center">
                        <h4 class="text-lg font-semibold text-blue-600 mb-4">あなた</h4>
                        <div class="space-y-3">
                            <div class="bg-blue-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-blue-600">${myData.activeOKRs}</div>
                                <div class="text-sm text-gray-600">アクティブOKR</div>
                            </div>
                            <div class="bg-blue-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-blue-600">${myData.avgProgress}%</div>
                                <div class="text-sm text-gray-600">平均達成率</div>
                            </div>
                            <div class="bg-blue-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-blue-600">${myData.streak}</div>
                                <div class="text-sm text-gray-600">連続更新日</div>
                            </div>
                            <div class="bg-blue-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-blue-600">${myData.totalPoints}</div>
                                <div class="text-sm text-gray-600">獲得ポイント</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-center">
                        <h4 class="text-lg font-semibold text-green-600 mb-4">友達</h4>
                        <div class="space-y-3">
                            <div class="bg-green-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-green-600">${friendData.activeOKRs}</div>
                                <div class="text-sm text-gray-600">アクティブOKR</div>
                            </div>
                            <div class="bg-green-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-green-600">${friendData.avgProgress}%</div>
                                <div class="text-sm text-gray-600">平均達成率</div>
                            </div>
                            <div class="bg-green-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-green-600">${friendData.streak}</div>
                                <div class="text-sm text-gray-600">連続更新日</div>
                            </div>
                            <div class="bg-green-50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-green-600">${friendData.totalPoints}</div>
                                <div class="text-sm text-gray-600">獲得ポイント</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mt-6 text-center">
                    <p class="text-gray-600">
                        ${myData.totalPoints > friendData.totalPoints 
                            ? '🎉 あなたの方が多くのポイントを獲得しています！' 
                            : myData.totalPoints < friendData.totalPoints 
                                ? '💪 友達に追いつくために頑張りましょう！'
                                : '🤝 同じポイントです！お互い頑張っていますね！'
                        }
                    </p>
                </div>
            </div>
        `;
    }

    // ユーティリティ関数
    generateId() {
        return 'okr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    addToHistory(action, description, progress = null) {
        this.history.push({
            id: this.generateId(),
            action,
            description,
            progress,
            date: new Date().toISOString()
        });
    }

    showModal() {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-overlay').classList.add('flex');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-overlay').classList.remove('flex');
    }

    // OKR編集・削除
    editOKR(okrId) {
        const okr = this.okrs.find(o => o.id === okrId);
        if (!okr) return;

        const modal = document.getElementById('modal-content');
        modal.innerHTML = `
            <h2 class="text-2xl font-bold text-gray-800 mb-6">OKRを編集</h2>
            <form id="edit-okr-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Objective（目標）</label>
                    <input type="text" id="objective" name="objective" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">説明（任意）</label>
                    <textarea id="description" name="description" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows="3"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">開始日</label>
                        <input type="date" id="start-date" name="start-date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">終了日</label>
                        <input type="date" id="end-date" name="end-date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Key Results</label>
                    <div id="key-results-container" class="space-y-3"></div>
                    <button type="button" id="add-kr-btn" class="mt-2 text-blue-600 hover:text-blue-800 text-sm">+ Key Resultを追加</button>
                </div>

                <div class="flex justify-end space-x-3 pt-6">
                    <button type="button" onclick="okrTracker.closeModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800">キャンセル</button>
                    <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">保存</button>
                </div>
            </form>
        `;

        // 初期値を設定
        document.getElementById('objective').value = okr.objective;
        document.getElementById('description').value = okr.description || '';
        document.getElementById('start-date').value = okr.startDate;
        document.getElementById('end-date').value = okr.endDate;

        const container = document.getElementById('key-results-container');
        container.innerHTML = okr.keyResults.map((kr, idx) => this.renderKeyResultInput(idx, kr)).join('');

        document.getElementById('add-kr-btn').addEventListener('click', () => {
            const count = container.children.length;
            if (count < 5) {
                container.insertAdjacentHTML('beforeend', this.renderKeyResultInput(count));
            }
        });

        document.getElementById('edit-okr-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateOKR(okrId);
        });

        this.showModal();
    }

    updateOKR(okrId) {
        const okr = this.okrs.find(o => o.id === okrId);
        if (!okr) return;

        const form = document.getElementById('edit-okr-form');
        const formData = new FormData(form);

        okr.objective = formData.get('objective');
        okr.description = formData.get('description');
        okr.startDate = formData.get('start-date');
        okr.endDate = formData.get('end-date');

        const keyResults = [];
        let index = 0;
        while (formData.get(`kr-description-${index}`)) {
            keyResults.push({
                description: formData.get(`kr-description-${index}`),
                target: parseFloat(formData.get(`kr-target-${index}`)),
                current: parseFloat(formData.get(`kr-current-${index}`) || 0),
                unit: formData.get(`kr-unit-${index}`) || ''
            });
            index++;
        }
        okr.keyResults = keyResults;

        this.addToHistory('OKR更新', `「${okr.objective}」を更新しました`);
        this.saveData();
        this.closeModal();
        this.updateDashboard();
        this.updateOKRView();
    }

    deleteOKR(okrId) {
        if (confirm('このOKRを削除しますか？この操作は取り消せません。')) {
            this.okrs = this.okrs.filter(okr => okr.id !== okrId);
            this.addToHistory('OKR削除', 'OKRを削除しました');
            this.saveData();
            this.updateDashboard();
            this.updateOKRView();
        }
    }

    updateProgress(okrId) {
        this.showView('progress');
    }

    setupEventListeners() {
        // ナビゲーション
        const navDashboard = document.getElementById('nav-dashboard');
        if (navDashboard) navDashboard.addEventListener('click', () => this.showView('dashboard'));
        const navOkrs = document.getElementById('nav-okrs');
        if (navOkrs) navOkrs.addEventListener('click', () => this.showView('okr'));
        const navProgress = document.getElementById('nav-progress');
        if (navProgress) navProgress.addEventListener('click', () => this.showView('progress'));
        const navReports = document.getElementById('nav-reports');
        if (navReports) navReports.addEventListener('click', () => this.showView('reports'));
        const navCompare = document.getElementById('nav-compare');
        if (navCompare) navCompare.addEventListener('click', () => this.showView('compare'));

        // ボタンアクション
        const startOkrBtn = document.getElementById('start-okr-btn');
        if (startOkrBtn) startOkrBtn.addEventListener('click', () => this.showView('okr'));
        const addOkrBtn = document.getElementById('add-okr-btn');
        if (addOkrBtn) addOkrBtn.addEventListener('click', () => this.showAddOKRModal());
        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) shareBtn.addEventListener('click', () => this.shareResults());

        // エクスポート/インポート
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.showExportOptions());
        const importBtn = document.getElementById('import-btn');
        if (importBtn) importBtn.addEventListener('click', () => this.showImportOptions());

        // 比較機能
        const generateShareCode = document.getElementById('generate-share-code');
        if (generateShareCode) generateShareCode.addEventListener('click', () => this.generateShareCode());
        const importFriendData = document.getElementById('import-friend-data');
        if (importFriendData) importFriendData.addEventListener('click', () => this.importFriendData());
        const copyShareCode = document.getElementById('copy-share-code');
        if (copyShareCode) copyShareCode.addEventListener('click', () => this.copyShareCode());

        // モーダル
        const modalOverlay = document.getElementById('modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.closeModal();
                }
            });
        }

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        this.createManualBackup();
                        break;
                    case 'e':
                        e.preventDefault();
                        this.showExportOptions();
                        break;
                    case 'i':
                        e.preventDefault();
                        this.showImportOptions();
                        break;
                }
            }
        });

        // アフィリエイトリンク設定
        this.setupAffiliateLinks();
    }
}

// グローバルインスタンスを作成
const okrTracker = new OKRTracker();