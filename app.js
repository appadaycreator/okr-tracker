// OKRトラッカー メインアプリケーション
class OKRTracker {
    constructor() {
        this.okrs = [];
        this.history = [];
        this.currentView = 'dashboard';
        this.streak = 0;
        this.totalPoints = 0;
        this.lastUpdate = null;
        
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.updateDashboard();
        this.showView('dashboard');
    }

    // データ管理
    async loadData() {
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
            this.updateStreak();
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    saveData() {
        try {
            const data = {
                okrs: this.okrs,
                history: this.history,
                streak: this.streak,
                totalPoints: this.totalPoints,
                lastUpdate: new Date().toISOString()
            };
            localStorage.setItem('okr-tracker-data', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save data:', error);
        }
    }

    // イベントリスナー設定
    setupEventListeners() {
        // ナビゲーション
        document.getElementById('nav-dashboard').addEventListener('click', () => this.showView('dashboard'));
        document.getElementById('nav-okrs').addEventListener('click', () => this.showView('okr'));
        document.getElementById('nav-progress').addEventListener('click', () => this.showView('progress'));
        document.getElementById('nav-reports').addEventListener('click', () => this.showView('reports'));
        document.getElementById('nav-compare').addEventListener('click', () => this.showView('compare'));

        // ボタンアクション
        document.getElementById('start-okr-btn').addEventListener('click', () => this.showView('okr'));
        document.getElementById('add-okr-btn').addEventListener('click', () => this.showAddOKRModal());
        document.getElementById('share-btn').addEventListener('click', () => this.shareResults());

        // 比較機能
        document.getElementById('generate-share-code').addEventListener('click', () => this.generateShareCode());
        document.getElementById('import-friend-data').addEventListener('click', () => this.importFriendData());
        document.getElementById('copy-share-code').addEventListener('click', () => this.copyShareCode());

        // モーダル
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-overlay')) {
                this.closeModal();
            }
        });

        // アフィリエイトリンク設定
        this.setupAffiliateLinks();
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

    renderKeyResultInput(index) {
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="grid grid-cols-1 gap-3">
                    <input type="text" name="kr-description-${index}" required class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Key Result ${index + 1}の説明">
                    <div class="grid grid-cols-3 gap-2">
                        <input type="number" name="kr-target-${index}" required min="1" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="目標値">
                        <input type="text" name="kr-unit-${index}" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="単位">
                        <input type="number" name="kr-current-${index}" min="0" value="0" class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="現在値">
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
        // 編集機能の実装（簡略化）
        alert('編集機能は今後実装予定です');
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
}

// グローバルインスタンスを作成
const okrTracker = new OKRTracker();