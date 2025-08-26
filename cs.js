// ==UserScript==
// @name         电商平台商品信息助手
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  电商平台商品信息提取、保存、出证及记录管理工具
// @author       alan
// @match        *://www.taobao.com/*
// @match        *://taobao.com/*
// @match        *://detail.tmall.com/*
// @match        *://item.taobao.com/*
// @match        *://mobile.pinduoduo.com/*
// @match        *://m.pinduoduo.com/*
// @match        *://item.jd.com/*
// @match        *://mall.jd.com/*
// @match        *://jd.com/*
// @match        *://ysc.teamsync.cn/*
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const LOGIN_URL = "https://ysc.teamsync.cn/login?redirect=%2Findex";
    const AUTH_STATE_KEY = 'yscAuthState'; 
    const TOKEN_KEY = 'yscAdminToken';     
    const CONTROL_PANEL_POS_KEY = 'controlPanelPosition'; 
    const PRODUCT_INFO_POS_KEY = 'productInfoPosition';   
    const log = (message, data) => {
        const timestamp = new Date().toISOString().slice(11, 23);
        console.log(`[${timestamp} 商品助手] ${message}`, data || '');
    };
    const initStorages = () => {
        if (!localStorage.getItem('multiPlatformProducts')) {
            localStorage.setItem('multiPlatformProducts', JSON.stringify([]));
        }
        if (!localStorage.getItem('certificationRecords')) {
            localStorage.setItem('certificationRecords', JSON.stringify([]));
        }
    };
    const getPlatformInfo = (url) => {
        if (url.includes('tmall.com')) return '天猫';
        if (url.includes('taobao.com')) return '淘宝';
        if (url.includes('pinduoduo.com')) return '拼多多';
        if (url.includes('jd.com')) return '京东';
        if (url.includes('ysc.teamsync.cn')) return '认证平台';
        return '未知平台';
    };
    const handleAdminToken = () => {
        const platform = getPlatformInfo(window.location.href);
        if (platform !== '认证平台') {
            showToast('请在认证平台页面获取认证信息', 'error');
            return false;
        }

        const cookies = document.cookie.split(';');
        let adminToken = null;

        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'Admin-Token') {
                adminToken = value;
                break;
            }
        }

        if (adminToken) {
            try {
                GM_setValue(TOKEN_KEY, adminToken);
                GM_setValue(AUTH_STATE_KEY, true); 

                const savedToken = GM_getValue(TOKEN_KEY);
                const authState = GM_getValue(AUTH_STATE_KEY);

                if (savedToken && authState) {
                    showToast('已成功获取最新认证信息', 'success');
                    updateAllButtonStates();
                    return true;
                } else {
                    throw new Error("保存认证信息失败");
                }
            } catch (e) {
                try {
                    localStorage.setItem(TOKEN_KEY, adminToken);
                    localStorage.setItem(AUTH_STATE_KEY, 'true');
                    showToast('已成功获取最新认证信息', 'success');
                    updateAllButtonStates();
                    return true;
                } catch (e2) {
                    showToast(`获取认证信息失败: ${e2.message}`, 'error');
                    return false;
                }
            }
        } else {
            showToast('未找到认证信息，请先登录认证平台', 'error');
            return false;
        }
    };
    const checkAuthState = () => {
        try {
            const hasAuth = GM_getValue(AUTH_STATE_KEY, false);
            const token = GM_getValue(TOKEN_KEY);
            if (hasAuth && token) {
                return { isAuthenticated: true };
            }
            const lsAuth = localStorage.getItem(AUTH_STATE_KEY) === 'true';
            const lsToken = localStorage.getItem(TOKEN_KEY);
            if (lsAuth && lsToken) {
                return { isAuthenticated: true };
            }
            return { isAuthenticated: false };
        } catch (e) {
            return { isAuthenticated: false };
        }
    };
    const resetAuthState = () => {
        try {
            GM_deleteValue(TOKEN_KEY);
            GM_deleteValue(AUTH_STATE_KEY);
        } catch (e) {
            log("清除GM存储的认证信息失败", e);
        }
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(AUTH_STATE_KEY);
        } catch (e) {
            log("清除localStorage的认证信息失败", e);
        }
        updateAllButtonStates();
        showToast('认证信息已清除，请重新获取', 'info');
    };
    const updateAllButtonStates = () => {
        updateProductInfoBtnState();
        updateControlPanelAuthBtn();
    };
    const updateProductInfoBtnState = () => {
        const triggerBtn = document.getElementById('productInfoTrigger');
        const platform = getPlatformInfo(window.location.href);

        if (!triggerBtn || !['淘宝', '天猫', '拼多多', '京东'].includes(platform)) {
            return;
        }

        const authState = checkAuthState();
        if (authState.isAuthenticated) {
            triggerBtn.disabled = false;
            triggerBtn.style.background = platform === '淘宝' ? '#FF4400' :
            platform === '天猫' ? '#FF0036' :
            platform === '拼多多' ? '#E02E24' : '#E31436';
            triggerBtn.style.cursor = 'pointer';
            triggerBtn.title = '点击查看商品信息 | 可拖拽移动位置';
        } else {
            triggerBtn.disabled = true;
            triggerBtn.style.background = 'rgba(150,150,150,0.6)';
            triggerBtn.style.cursor = 'not-allowed';
            triggerBtn.title = '请先到认证平台获取认证信息 | 可拖拽移动位置';
        }
    };
    const updateControlPanelAuthBtn = () => {
        const platform = getPlatformInfo(window.location.href);
        const authBtn = document.getElementById('authControlBtn');
        if (!authBtn) return;

        const authState = checkAuthState();
        if (platform === '认证平台') {
            if (authState.isAuthenticated) {
                authBtn.textContent = '已认证（官网）';
                authBtn.style.background = '#4CAF50';
                authBtn.onclick = () => {
                    if (confirm('是否要清除当前认证信息？')) {
                        resetAuthState();
                    }
                };
            } else {
                authBtn.textContent = '获取认证信息';
                authBtn.style.background = '#9C27B0';
                authBtn.onclick = handleAdminToken;
            }
        } else {
            if (authState.isAuthenticated) {
                authBtn.textContent = '已登录';
                authBtn.style.background = '#4CAF50';
                authBtn.onclick = () => {
                    showToast('您已完成认证，将跳转到认证平台', 'info');
                    window.open(LOGIN_URL, '_blank');
                };
            } else {
                authBtn.textContent = '登录';
                authBtn.style.background = '#9C27B0';
                authBtn.onclick = redirectToLogin;
            }
        }
    };
    const saveCertificationRecord = (productData, responseData, isSuccess) => {
        initStorages();
        const records = JSON.parse(localStorage.getItem('certificationRecords'));
        const newRecord = {
            id: records.length + 1,
            productId: productData.id,
            productName: productData.productName,
            productUrl: productData.productUrl,
            platform: productData.platform,
            requestTime: new Date().toLocaleString(),
            response: responseData,
            isSuccess: isSuccess
        };
        records.push(newRecord);
        localStorage.setItem('certificationRecords', JSON.stringify(records));
        log(`已保存公证记录 #${newRecord.id}`);
        return newRecord;
    };
    const getAllCertificationRecords = () => {
        initStorages();
        return JSON.parse(localStorage.getItem('certificationRecords'));
    };
    const redirectToLogin = () => {
        window.open(LOGIN_URL, '_blank');
        showToast('已打开认证平台，请登录后获取认证信息', 'info');
    };

    const sendCertificationRequest = (productData) => {
        const certificationUrl = "https://ysc.teamsync.cn/prod-api/system/ecTaskYingGood";
        const authState = checkAuthState();

        if (!authState.isAuthenticated) {
            const errorMsg = '未获取有效认证信息，请先到官网完成用户登录认证';
            showToast(errorMsg, 'error', true);
            return Promise.reject(new Error(errorMsg));
        }
        let token;
        try {
            token = GM_getValue(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
        } catch (e) {
            token = localStorage.getItem(TOKEN_KEY);
        }

        const authorizationToken = `Bearer ${token}`;
        const certificationData = {
            taskYingId: 1,
            detailUrl: productData.productUrl,
            shopName: productData.shopName || '商品名称',
            title: productData.productName,
            infringementPlatform: productData.platform,
            salesVolume: productData.salesCount,
        };

        showLoadingToast('正在提交公证请求...');
        log("发送公证请求数据:", certificationData);

        return fetch(certificationUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": authorizationToken
            },
            body: JSON.stringify(certificationData)
        })
            .then(response => {
            if (response.status === 401) {
                hideLoadingToast();
                showToast('认证已过期，请重新到认证平台获取认证信息', 'error', true);
                resetAuthState(); 
                return Promise.reject(new Error('认证已过期'));
            }
            return response.text().then(text => {
                hideLoadingToast();
                try {
                    return { status: response.status, data: JSON.parse(text), rawText: text };
                } catch (e) {
                    return { status: response.status, data: null, rawText: text, parseError: e.message };
                }
            });
        })
            .then(result => {
            let isSuccess = false;
            let message = '';
            let isAuthError = false;

            if (result.data) {
                if (result.status === 200 && (result.data.code === 200 || result.data.success)) {
                    isSuccess = true;
                    message = '公证请求提交成功';
                    showToast(message, 'success');
                } else {
                    message = result.data.msg || `公证失败 (业务码: ${result.data.code})`;
                    showToast(message, 'error');
                    if (message.includes('认证') || message.includes('权限') ||
                        result.data.code === 401 || result.data.code === 403) {
                        isAuthError = true;
                    }
                }
            } else {
                message = `请求失败: 无法解析服务器响应`;
                showToast(message, 'error');
            }
            if (isAuthError) {
                resetAuthState();
            }

            saveCertificationRecord(productData, result, isSuccess);
            updateCertificationStatus(productData.productUrl);
            return { success: isSuccess, message: message, response: result, isAuthError: isAuthError };
        })
            .catch(error => {
            hideLoadingToast();
            const errorMsg = `公证请求错误: ${error.message}`;
            showToast(errorMsg, 'error');
            if (error.message.includes('认证') || error.message.includes('401') ||
                error.message.includes('权限')) {
                resetAuthState();
            }

            throw error;
        });
    };
    const saveProductInfo = (data, sendCert = false) => {
        initStorages();
        const products = JSON.parse(localStorage.getItem('multiPlatformProducts'));
        const newProduct = {
            id: products.length + 1,
            platform: data.platform,
            shopName: data.shopName || '未知店铺',
            productName: data.productName || '未知商品',
            productUrl: data.productUrl || '未知链接',
            salesCount: data.salesCount || '未知',
            addTime: new Date().toLocaleString()
        };

        const isDuplicate = products.some(p => p.productUrl === newProduct.productUrl);
        if (!isDuplicate) {
            products.push(newProduct);
            localStorage.setItem('multiPlatformProducts', JSON.stringify(products));
            log(`已保存商品 #${newProduct.id}`);
            showToast(`已保存${newProduct.platform}商品信息`, 'success');
            if (sendCert) {
                sendCertificationRequest(newProduct)
                    .then(res => log("公证请求响应:", res))
                    .catch(err => {});
            }
            return { success: true, product: newProduct };
        }
        log(`商品已存在，未重复保存`);
        showToast('该商品信息已保存，无需重复操作', 'info');
        return { success: false, product: null };
    };

    const updateCertificationStatus = (productUrl) => {
        const popup = document.getElementById('productInfoPopup');
        if (popup) {
            const certifyBtn = popup.querySelector('#certifyProduct');
            if (certifyBtn) {
                const isCertified = hasProductBeenCertified(productUrl);
                certifyBtn.textContent = isCertified ? '已申请公证' : '申请公证';
                certifyBtn.style.background = isCertified ? '#9E9E9E' : '#2196F3';
            }
        }
        const listModal = document.getElementById('productListModal');
        if (listModal) {
            listModal.remove();
            showProductList();
        }
    };

    const hasProductBeenCertified = (productUrl) => {
        const records = getAllCertificationRecords();
        return records.some(record => record.productUrl === productUrl && record.isSuccess);
    };
    const waitForElement = (selector, timeout = 5000, interval = 300) => {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkElement = () => {
                const element = document.querySelector(selector);
                if (element) resolve(element);
                else if (Date.now() - startTime >= timeout) reject(new Error(`超时未找到元素: ${selector}`));
                else setTimeout(checkElement, interval);
            };
            checkElement();
        });
    };

    const extractProductName = async (url, platform) => {
        if (document.title && document.title.trim() !== '') {
            if (platform === '拼多多') {
                const title = document.title.trim();
                const bracketMatch = title.match(/【(.*?)】/);
                if (bracketMatch && bracketMatch[1]) return bracketMatch[1].trim();
                const hyphenMatch = title.split('-')[0].trim();
                if (hyphenMatch && hyphenMatch.length > 5) return hyphenMatch;
            } else if (platform === '京东') {
                const title = document.title.trim();
                const jdMatch = title.split('_京东')[0].trim();
                if (jdMatch && jdMatch.length > 5) return jdMatch;
            } else {
                return document.title.split('-')[0].trim();
            }
        }

        let selectors = [];
        if (platform === '拼多多') {
            selectors = [
                "span[class*='enable-select']", "div[class*='goods-title'] span",
                ".goods-name", "[class*='product-title']", "[class*='main-title']",
                "[id*='goods-name']", "h1[class*='title']", "div[class*='detail-title']"
            ];
        } else if (platform === '京东') {
            selectors = [
                ".sku-name", "#product-name", ".item-name", "h1[class*='product-title']",
                "[class*='main-title']", "[id*='productName']"
            ];
        } else {
            selectors = [
                "h1[class*='title']", ".tb-main-title", ".title-text",
                "[class*='product-name']", "[id*='J_DetailMeta'] h1"
            ];
        }

        for (const selector of selectors) {
            try {
                const element = await waitForElement(selector, 3000);
                const productName = element.textContent.trim();
                if (productName && productName.length > 5 &&
                    !productName.includes('http') && !productName.includes('点击')) {
                    return productName;
                }
            } catch (err) {
                log(`选择器 "${selector}" 获取商品名称失败: ${err.message}`);
            }
        }

        return `未识别商品名称`;
    };
    const getSalesCount = (platform) => {
        let selectors, salesPattern;
        if (platform === '拼多多') {
            selectors = [
                "div[class='AsbGpQv_']", "[class*='sales-count']", "[class*='sold-num']",
                "[class*='volume']", "[class*='sales-amount']", "[class*='sell-count']"
            ];
            salesPattern = /(已售|销量|售)\s*([\d.]+[万]+[\+]?)/;
        } else if (platform === '京东') {
            selectors = [
                ".sales-amount", "[class*='sell-count']", "[id*='comment-count']",
                "[class*='item-comment']", ".count"
            ];
            salesPattern = /(已售|销量|评价)\s*([\d.]+[万]+[\+]?)/;
        } else {
            selectors = [
                "div[class*='salesDesc']", ".tm-count", ".sale-num", ".sell-count",
                ".tm-ind-sellCount .tm-count", ".tb-detail-sell-count .tm-count"
            ];
            salesPattern = /(已售|销量|月销)\s*([\d.]+[万]+[\+]?)/;
        }

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const salesText = element.innerText.trim();
                if (salesText) {
                    const salesMatch = salesText.match(salesPattern);
                    if (salesMatch && salesMatch[2]) return salesMatch[2];
                    return salesText;
                }
            }
        }

        return new Promise(resolve => {
            setTimeout(() => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const salesText = element.innerText.trim();
                        if (salesText) {
                            const salesMatch = salesText.match(salesPattern);
                            if (salesMatch && salesMatch[2]) {
                                resolve(salesMatch[2]);
                                return;
                            }
                            resolve(salesText);
                            return;
                        }
                    }
                }
                resolve('未知');
            }, 2000);
        });
    };

    const getShopName = (platform) => {
        let selectors;
        if (platform === '拼多多') {
            selectors = [
                "div[class='BAq4Lzv7']", ".mall-name", ".seller-name", ".shop-name",
                ".merchant-name", "[class*='shop-name']", "[class*='mall-name']"
            ];
        } else if (platform === '京东') {
            selectors = [
                "div[class='name']", ".shop-name", ".J-hove-wrap", "[class*='seller-name']",
                "[id*='shopInfoLink']", ".shop-title"
            ];
        } else {
            selectors = [
                "span[class*='shopName']", "a[class*='shopName']", ".shop-name > a",
                ".slogo-shopname > a", "[data-spm='a220m.1000858']"
            ];
        }

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const shopName = element.textContent.trim();
                if (shopName && shopName.length > 2) {
                    return shopName;
                }
            }
        }

        return new Promise(resolve => {
            setTimeout(() => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const shopName = element.textContent.trim();
                        if (shopName && shopName.length > 2) {
                            resolve(shopName);
                            return;
                        }
                    }
                }
                resolve(null);
            }, 2000);
        });
    };
    const getAllProducts = () => {
        initStorages();
        return JSON.parse(localStorage.getItem('multiPlatformProducts'));
    };
    const clearProductStorage = () => {
        if (confirm('确定要清空所有已保存的商品信息吗？')) {
            localStorage.setItem('multiPlatformProducts', JSON.stringify([]));
            log('已清空所有商品信息');
            showToast('已清空所有商品信息', 'info');
            const listModal = document.getElementById('productListModal');
            if (listModal) {
                listModal.remove();
                showProductList();
            }
        }
    };
    const clearCertificationRecords = () => {
        if (confirm('确定要清空所有公证记录吗？')) {
            localStorage.setItem('certificationRecords', JSON.stringify([]));
            log('已清空所有公证记录');
            showToast('已清空所有公证记录', 'info');
            const certModal = document.getElementById('certificationRecordsModal');
            if (certModal) {
                certModal.remove();
                showCertificationRecords();
            }
        }
    };

    // 导出到Excel
    const exportToXLSX = () => {
        const products = getAllProducts();
        if (products.length === 0) {
            showToast('没有可导出的商品信息', 'info');
            return;
        }

        showLoadingToast('正在生成Excel文件...');
        const wsData = [
            ['序号', '平台', '商品名称', '店铺名称', '销量', '公证状态', '商品链接', '添加时间'] 
        ];
        products.forEach(p => {
            const isCertified = hasProductBeenCertified(p.productUrl);
            wsData.push([
                p.id, p.platform, p.productName, p.shopName,
                p.salesCount, isCertified ? '已申请' : '未申请', 
                p.productUrl, p.addTime
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            {wch: 6}, {wch: 8}, {wch: 30}, {wch: 20},
            {wch: 10}, {wch: 12}, 
            {wch: 50}, {wch: 20}
        ];
        XLSX.utils.book_append_sheet(wb, ws, "商品列表");

        setTimeout(() => {
            XLSX.writeFile(wb, `商品信息_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
            hideLoadingToast();
            showToast(`成功导出 ${products.length} 条商品信息到Excel`, 'success');
        }, 500);
    };
    const showLoadingToast = (message) => {
        hideLoadingToast();
        const toast = document.createElement('div');
        toast.id = 'loadingToast';
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            z-index: 999999;
            font-size: 16px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
    };

    const hideLoadingToast = () => {
        const toast = document.getElementById('loadingToast');
        if (toast) toast.remove();
    };
    const showToast = (message, type = 'info', showLoginButton = false) => {
        const existingToast = document.querySelector('.message-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'message-toast';
        let bgColor;
        switch(type) {
            case 'success': bgColor = '#4CAF50'; break;
            case 'error': bgColor = '#f44336'; break;
            case 'warning': bgColor = '#ff9800'; break;
            default: bgColor = '#2196F3';
        }

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 999999;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: fadein 0.3s ease-out;
        `;

        if (showLoginButton) {
            toast.innerHTML = `
                <span>${message}</span>
                <button id="toastLoginBtn" style="
                    background: white;
                    color: ${bgColor};
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">去认证</button>
            `;
        } else {
            toast.textContent = message;
        }

        document.body.appendChild(toast);
        if (showLoginButton) {
            document.getElementById('toastLoginBtn').addEventListener('click', () => {
                redirectToLogin();
                toast.remove();
            });
        } else {
            setTimeout(() => {
                toast.style.animation = 'fadeout 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    };
    const addGlobalStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadein { from {top: 0; opacity: 0;} to {top: 20px; opacity: 1;} }
            @keyframes fadeout { from {top: 20px; opacity: 1;} to {top: 0; opacity: 0;} }
            @keyframes slideInRight { from {right: -400px; opacity: 0;} to {right: 30px; opacity: 1;} }
            @keyframes slideOutRight { from {right: 30px; opacity: 1;} to {right: -400px; opacity: 0;} }
            .draggable {
                cursor: move;
                user-select: none;
                -webkit-user-select: none;
            }
            .dragging {
                opacity: 0.7;
                z-index: 999999 !important;
            }
            .control-panel-hidden {
                display: none !important;
            }
            .filter-btn.active {
                background: #4CAF50 !important;
                color: white !important;
            }
            /* 新增：操作列按钮横向排列容器样式 */
            .action-btn-group {
                display: flex;
                gap: 4px;
                align-items: center;
                justify-content: flex-start;
            }
        `;
        document.head.appendChild(style);
    };
    const saveButtonPosition = (key, position) => {
        try {
            GM_setValue(key, JSON.stringify(position));
        } catch (e) {
            try {
                localStorage.setItem(key, JSON.stringify(position));
            } catch (e2) {
                log(`保存按钮位置失败: ${e2.message}`);
            }
        }
    };
    const getSavedButtonPosition = (key, defaultPosition) => {
        try {
            const posStr = GM_getValue(key);
            if (posStr) return JSON.parse(posStr);
        } catch (e) {
            try {
                const posStr = localStorage.getItem(key);
                if (posStr) return JSON.parse(posStr);
            } catch (e2) {
                log(`获取保存的按钮位置失败: ${e2.message}`);
            }
        }
        return defaultPosition;
    };
    const makeElementDraggable = (element, positionKey, onDragEnd = null) => {
        element.classList.add('draggable');
        let isDragging = false;
        const savedPos = {
            top: positionKey === CONTROL_PANEL_POS_KEY ? '50px' : 'auto',  
            bottom: positionKey === PRODUCT_INFO_POS_KEY ? '50px' : 'auto', 
             right: positionKey === CONTROL_PANEL_POS_KEY ? '20px' : '20px'  
        };
        element.style.top = savedPos.top;
        element.style.right = savedPos.right;
        element.style.bottom = savedPos.bottom;
        element.style.left = 'auto';
        element.style.position = 'fixed';
        element.onmousedown = startDrag;

        function startDrag(e) {
            e = e || window.event;
            e.preventDefault();
            isDragging = true;
            element.classList.add('dragging');
            const startX = e.clientX;
            const startY = e.clientY;
            const rect = element.getBoundingClientRect();
            const elementLeft = rect.left;
            const elementTop = rect.top;
            document.onmousemove = drag;
            document.onmouseup = stopDrag;
            function drag(e) {
                if (!isDragging) return;
                e = e || window.event;
                e.preventDefault();
                const centerX = element.offsetWidth / 2;
                const centerY = element.offsetHeight / 2;
                let newTop = e.clientY - centerY;
                let newLeft = e.clientX - centerX;
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));
                newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
                element.style.top = newTop + "px";
                element.style.left = newLeft + "px";
                element.style.right = "auto";
                element.style.bottom = "auto";
            }

            function stopDrag() {
                isDragging = false;
                document.onmousemove = null;
                document.onmouseup = null;
                element.classList.remove('dragging');
                const position = {
                    top: element.style.top,
                    right: (window.innerWidth - (parseInt(element.style.left) + element.offsetWidth)) + "px"
                };
                saveButtonPosition(positionKey, position);
                if (onDragEnd) onDragEnd(position);
            }
        }
    };
    const createControlButtons = () => {
        if (document.getElementById('shoppingControlPanel')) return;

        const triggerBtn = document.createElement('button');
        triggerBtn.id = 'controlPanelTrigger';
        triggerBtn.textContent = '商品助手 ▼';
        triggerBtn.style.cssText = `
            position: fixed;
            top: 50px;
            right: 50px;
            background: #9C27B0;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 999998;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        document.body.appendChild(triggerBtn);
        const panel = document.createElement('div');
        panel.id = 'shoppingControlPanel';
        panel.className = 'control-panel-hidden';
        panel.style.cssText = `
            position: absolute;
            z-index: 999997;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: white;
            padding: 15px;
            border-radius: 4px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.2);
            min-width: 180px;
        `;
        const authBtn = document.createElement('button');
        authBtn.id = 'authControlBtn';
        authBtn.style.cssText = `
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
        `;
        panel.appendChild(authBtn);
        const taobaoJumpBtn = document.createElement('button');
        taobaoJumpBtn.textContent = '跳转淘宝网页版';
        taobaoJumpBtn.style.cssText = `
            background: #FF4400;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
        `;
        taobaoJumpBtn.addEventListener('click', () => {
            window.open('https://www.taobao.com/', '_blank');
            showToast('已打开淘宝网页版', 'info');
        });
        panel.appendChild(taobaoJumpBtn);
        const jdJumpBtn = document.createElement('button');
        jdJumpBtn.textContent = '跳转京东网页版';
        jdJumpBtn.style.cssText = `
            background: #E31436;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
        `;
        jdJumpBtn.addEventListener('click', () => {
            window.open('https://www.jd.com/', '_blank');
            showToast('已打开京东网页版', 'info');
        });
        panel.appendChild(jdJumpBtn);
        const pddJumpBtn = document.createElement('button');
        pddJumpBtn.textContent = '跳转拼多多网页版';
        pddJumpBtn.style.cssText = `
            background: #E02E24;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
        `;
        pddJumpBtn.addEventListener('click', () => {
            window.open('https://mobile.pinduoduo.com/', '_blank');
            showToast('已打开拼多多网页版', 'info');
        });
        panel.appendChild(pddJumpBtn);
        const viewBtn = document.createElement('button');
        viewBtn.textContent = '查看商品记录';
        viewBtn.style.cssText = `
            background: #FF9800;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
        `;
        viewBtn.addEventListener('click', () => {
            const authState = checkAuthState();
            if (authState.isAuthenticated) {
                showProductList();
            } else {
                showToast('请先到官网完成用户登录认证', 'error', true);
            }
        });
        panel.appendChild(viewBtn);
        const certRecordBtn = document.createElement('button');
        certRecordBtn.textContent = '查看公证记录';
        certRecordBtn.style.cssText = `
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
        `;
        certRecordBtn.addEventListener('click', () => {
            const authState = checkAuthState();
            if (authState.isAuthenticated) {
                showCertificationRecords();
            } else {
                showToast('请先到官网完成用户登录认证', 'error', true);
            }
        });
        panel.appendChild(certRecordBtn);
        document.body.appendChild(panel);
        const adjustPanelPosition = () => {
            const rect = triggerBtn.getBoundingClientRect();
            panel.style.top = (rect.bottom + 5) + 'px';
            panel.style.right = (window.innerWidth - rect.right) + 'px';
        };
        let isExpanded = false;
        triggerBtn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            if (isExpanded) {
                adjustPanelPosition();
                panel.classList.remove('control-panel-hidden');
                triggerBtn.textContent = '商品助手 ▲';
            } else {
                panel.classList.add('control-panel-hidden');
                triggerBtn.textContent = '商品助手 ▼';
            }
        });
        document.addEventListener('click', (e) => {
            if (!triggerBtn.contains(e.target) && !panel.contains(e.target) && isExpanded) {
                isExpanded = false;
                panel.classList.add('control-panel-hidden');
                triggerBtn.textContent = '商品助手 ▼';
            }
        });
        window.addEventListener('resize', () => {
            if (isExpanded) {
                adjustPanelPosition();
            }
        });
        updateControlPanelAuthBtn();
        makeElementDraggable(triggerBtn, CONTROL_PANEL_POS_KEY, () => {
            if (isExpanded) {
                adjustPanelPosition();
            }
        });
    };
    const showCertificationRecords = () => {
        const records = getAllCertificationRecords();
        const existingModal = document.getElementById('certificationRecordsModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'certificationRecordsModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background: white;
            width: 100%;
            max-width: 1000px;
            max-height: 80vh;
            border-radius: 8px;
            padding: 20px;
            overflow: auto;
        `;

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                <h2 style="margin: 0; color: #333; font-size: 18px;">公证记录 (${records.length} 条)</h2>
                <div style="display: flex; gap: 10px;">
                    <button id="clearCertRecordsBtn" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">清空记录</button>
                    <button id="closeCertRecordsBtn" style="
                        background: #607D8B;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">关闭</button>
                </div>
            </div>
        `;

        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-top: 10px;
        `;

        table.innerHTML = `
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 5%;">序号</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 5%;">平台</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 25%;">商品名称</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 15%;">公证时间</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 10%;">状态</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 40%;">操作</th>
                </tr>
            </thead>
            <tbody id="certRecordsTableBody">
                ${records.length === 0 ? `
                    <tr>
                        <td colspan="6" style="border: 1px solid #ddd; padding: 20px; text-align: center;">
                            暂无公证记录
                        </td>
                    </tr>
                ` : ''}
            </tbody>
        `;

        container.appendChild(table);
        modal.appendChild(container);
        document.body.appendChild(modal);

        const tableBody = document.getElementById('certRecordsTableBody');
        const sortedRecords = [...records].sort((a, b) =>
                                                new Date(b.requestTime) - new Date(a.requestTime)
                                               );

        sortedRecords.forEach((record) => {
            const row = document.createElement('tr');
            row.style.backgroundColor = record.id % 2 === 0 ? '#fff' : '#f9f9f9'; '#f9f9f9';

            row.innerHTML = `
                <td style="border: 1px solid #ddd; padding: 8px;">${record.id}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">
                    <span style="color: ${
                        record.platform === '淘宝' ? '#FF4400' :
                        record.platform === '天猫' ? '#FF0036' :
                        record.platform === '拼多多' ? '#E02E24' : '#E31436'
                    }">${record.platform}</span>
                </td>
                <td style="border: 1px solid #ddd; padding: 8px; word-break: break-all;">${record.productName}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${record.requestTime}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">
                    <span style="color: ${record.isSuccess ? '#4CAF50' : '#f44336'}">${record.isSuccess ? '成功' : '失败'}</span>
                </td>
                <td style="border: 1px solid #ddd; padding: 8px;">
                    <div class="action-btn-group">
                        <a href="${record.productUrl}" target="_blank" style="
                            color: #2196F3;
                            text-decoration: none;
                            font-size: 12px;
                            padding: 4px 8px;
                            border-radius: 3px;
                            border: 1px solid #2196F3;
                        ">查看商品</a>
                        <button class="viewCertDetails" data-id="${record.id}" style="
                            background: #2196F3;
                            color: white;
                            border: none;
                            padding: 4px 8px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 12px;
                        ">查看详情</button>
                        ${!record.isSuccess ? `
                        <button class="retryCertification" data-id="${record.id}" style="
                            background: #ff9800;
                            color: white;
                            border: none;
                            padding: 4px 8px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 12px;
                        ">重试</button>
                        ` : ''}
                        <button class="deleteCertRecord" data-id="${record.id}" style="
                            background: #f44336;
                            color: white;
                            border: none;
                            padding: 4px 8px;
                            border-radius: 3px;
                            cursor: pointer;
                            font-size: 12px;
                        ">删除</button>
                    </div>
                </td>
            `;

            tableBody.appendChild(row);
        });
        document.getElementById('closeCertRecordsBtn').addEventListener('click', () => modal.remove());
        document.getElementById('clearCertRecordsBtn').addEventListener('click', clearCertificationRecords);
        document.querySelectorAll('.viewCertDetails').forEach(btn => {
            btn.addEventListener('click', function() {
                const recordId = parseInt(this.getAttribute('data-id'));
                const record = getAllCertificationRecords().find(r => r.id === recordId);
                if (record) {
                    const detailsModal = document.createElement('div');
                    detailsModal.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.7);
                        z-index: 9999999;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 20px;
                    `;
                    const detailsContainer = document.createElement('div');
                    detailsContainer.style.cssText = `
                        background: white;
                        width: 100%;
                        max-width: 800px;
                        max-height: 80vh;
                        border-radius: 8px;
                        padding: 20px;
                        overflow: auto;
                    `;
                    detailsContainer.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 style="margin: 0; color: #333; font-size: 16px;">公证详情 #${record.id}</h3>
                            <button class="closeDetailsBtn" style="
                                background: #f44336;
                                color: white;
                                border: none;
                                padding: 5px 10px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 13px;
                            ">关闭</button>
                        </div>
                        <p><strong>商品名称:</strong> ${record.productName}</p>
                        <p><strong>平台:</strong> ${record.platform}</p>
                        <p><strong>公证时间:</strong> ${record.requestTime}</p>
                        <p><strong>状态:</strong> <span style="color: ${record.isSuccess ? '#4CAF50' : '#f44336'}">${record.isSuccess ? '成功' : '失败'}</span></p>
                        <p><strong>商品链接:</strong> <a href="${record.productUrl}" target="_blank" style="color: #2196F3;">${record.productUrl}</a></p>
                        <p><strong>响应数据:</strong></p>
                        <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; white-space: pre-wrap;">${JSON.stringify(record.response, null, 2)}</pre>
                    `;
                    detailsModal.appendChild(detailsContainer);
                    document.body.appendChild(detailsModal);
                    detailsModal.querySelector('.closeDetailsBtn').addEventListener('click', () => detailsModal.remove());
                }
            });
        });
        document.querySelectorAll('.retryCertification').forEach(btn => {
            btn.addEventListener('click', function() {
                const recordId = parseInt(this.getAttribute('data-id'));
                const record = getAllCertificationRecords().find(r => r.id === recordId);
                if (record) {
                    const product = getAllProducts().find(p => p.productUrl === record.productUrl);
                    if (product) {
                        sendCertificationRequest(product)
                            .then(() => {
                            modal.remove();
                            showCertificationRecords();
                        });
                    } else {
                        showToast('未找到对应的商品信息，无法重试', 'error');
                    }
                }
            });
        });
        document.querySelectorAll('.deleteCertRecord').forEach(btn => {
            btn.addEventListener('click', function() {
                const recordId = parseInt(this.getAttribute('data-id'));
                const newRecords = getAllCertificationRecords().filter(r => r.id !== recordId);
                newRecords.forEach((r, index) => r.id = index + 1);
                localStorage.setItem('certificationRecords', JSON.stringify(newRecords));
                modal.remove();
                showCertificationRecords();
            });
        });
    };
    const showProductList = () => {
        const products = getAllProducts();
        const existingList = document.getElementById('productListModal');
        if (existingList) existingList.remove();

        const modal = document.createElement('div');
        modal.id = 'productListModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        `;
        const container = document.createElement('div');
        container.style.cssText = `
            background: white;
            width: 100%;
            max-width: 1000px;
            max-height: 80vh;
            border-radius: 8px;
            padding: 20px;
            overflow: auto;
        `;
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                <h2 style="margin: 0; color: #333; font-size: 18px;">已保存商品 (${products.length} 个)</h2>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <!-- 公证状态过滤按钮组 -->
                    <div style="display: flex; gap: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
                        <button class="filter-btn active" data-filter="all" style="
                            background: #4CAF50;
                            color: white;
                            border: none;
                            padding: 6px 12px;
                            cursor: pointer;
                            font-size: 12px;
                        ">全部</button>
                        <button class="filter-btn" data-filter="certified" style="
                            background: white;
                            color: #333;
                            border: none;
                            padding: 6px 12px;
                            cursor: pointer;
                            font-size: 12px;
                        ">已申请公证</button>
                        <button class="filter-btn" data-filter="uncertified" style="
                            background: white;
                            color: #333;
                            border: none;
                            padding: 6px 12px;
                            cursor: pointer;
                            font-size: 12px;
                        ">未申请公证</button>
                    </div>
                    <!-- 原有功能按钮 -->
                    <button id="exportProductBtn" style="
                        background: #2196F3;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">导出到Excel(XLSX)</button>
                    <button id="clearProductBtn" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">清空记录</button>
                    <button id="closeListBtn" style="
                        background: #607D8B;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    ">关闭</button>
                </div>
            </div>
        `;
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-top: 10px;
        `;

        table.innerHTML = `
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 5%;">序号</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 5%;">平台</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 20%;">商品名称</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 15%;">店铺名称</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 10%;">销量</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 12%;">公证状态</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 23%;">商品链接</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; width: 10%;">操作</th>
                </tr>
            </thead>
            <tbody id="productTableBody">
                ${products.length === 0 ? `
                    <tr>
                        <td colspan="8" style="border: 1px solid #ddd; padding: 20px; text-align: center;">
                            暂无保存的商品信息
                        </td>
                    </tr>
                ` : ''}
            </tbody>
        `;

        container.appendChild(table);
        modal.appendChild(container);
        document.body.appendChild(modal);
        let currentFilter = 'all'; 
        const productTableBody = document.getElementById('productTableBody');
        const renderProductTable = (filter) => {
            productTableBody.innerHTML = '';
            let filteredProducts = [];
            switch(filter) {
                case 'certified':
                    filteredProducts = products.filter(p => hasProductBeenCertified(p.productUrl));
                    break;
                case 'uncertified':
                    filteredProducts = products.filter(p => !hasProductBeenCertified(p.productUrl));
                    break;
                default:
                    filteredProducts = products;
            }
            if (filteredProducts.length === 0) {
                productTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="border: 1px solid #ddd; padding: 20px; text-align: center;">
                            暂无符合条件的商品信息
                        </td>
                    </tr>
                `;
                return;
            }

            filteredProducts.forEach((product) => {
                const isCertified = hasProductBeenCertified(product.productUrl);
                const row = document.createElement('tr');
                row.style.backgroundColor = product.id % 2 === 0 ? '#fff' : '#f9f9f9';

                row.innerHTML = `
                    <td style="border: 1px solid #ddd; padding: 8px;">${product.id}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">
                        <span style="color: ${
                            product.platform === '淘宝' ? '#FF4400' :
                            product.platform === '天猫' ? '#FF0036' :
                            product.platform === '拼多多' ? '#E02E24' : '#E31436'
                        }">${product.platform}</span>
                    </td>
                    <td style="border: 1px solid #ddd; padding: 8px; word-break: break-all;">${product.productName}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${product.shopName}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-weight: 500;">${product.salesCount}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">
                        <span style="color: ${isCertified ? '#4CAF50' : '#f44336'}; font-weight: 500;">
                            ${isCertified ? '已申请' : '未申请'}
                        </span>
                    </td>
                    <td style="border: 1px solid #ddd; padding: 8px; word-break: break-all;">
                        <a href="${product.productUrl}" target="_blank" style="color: #2196F3; font-size: 12px;">查看商品</a>
                    </td>
                    <td style="border: 1px solid #ddd; padding: 8px;">
                        <div class="action-btn-group">
                            <button class="certifyProduct" data-id="${product.id}" style="
                                background: ${isCertified ? '#9E9E9E' : '#4CAF50'};
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 12px;
                            ">${isCertified ? '已申请公证' : '申请公证'}</button>
                            <button class="deleteProduct" data-id="${product.id}" style="
                                background: #f44336;
                                color: white;
                                border: none;
                                padding: 4px 8px;
                                border-radius: 3px;
                                cursor: pointer;
                                font-size: 12px;
                            ">删除</button>
                        </div>
                    </td>
                `;

                productTableBody.appendChild(row);
            });
            bindTableButtons();
        };
        const bindTableButtons = () => {
            document.querySelectorAll('.certifyProduct').forEach(btn => {
                btn.addEventListener('click', function() {
                    if (this.textContent.trim() === '已申请公证') return;
                    const productId = parseInt(this.getAttribute('data-id'));
                    const product = products.find(p => p.id === productId);
                    if (product) {
                        sendCertificationRequest(product)
                            .then(response => {
                                if (response.success) {
                                    renderProductTable(currentFilter); 
                                }
                            });
                    }
                });
            });
            document.querySelectorAll('.deleteProduct').forEach(btn => {
                btn.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-id'));
                    const newProducts = products.filter(p => p.id !== productId);
                    newProducts.forEach((p, index) => p.id = index + 1);
                    localStorage.setItem('multiPlatformProducts', JSON.stringify(newProducts));
                    modal.remove();
                    showProductList(); 
                });
            });
        };
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                currentFilter = this.getAttribute('data-filter');
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'white';
                    b.style.color = '#333';
                });
                this.classList.add('active');
                this.style.background = '#4CAF50';
                this.style.color = 'white';
                renderProductTable(currentFilter);
            });
        });
        renderProductTable(currentFilter);
        document.getElementById('closeListBtn').addEventListener('click', () => modal.remove());
        document.getElementById('exportProductBtn').addEventListener('click', exportToXLSX);
        document.getElementById('clearProductBtn').addEventListener('click', () => {
            clearProductStorage();
            modal.remove();
        });
    };
    const showProductInfo = async (productUrl, shopName, platform, extraData = {}) => {
        const existingPopup = document.getElementById('productInfoPopup');
        const existingTrigger = document.getElementById('productInfoTrigger');
        if (existingPopup) existingPopup.remove();
        if (existingTrigger) existingTrigger.remove();
        const productName = await extractProductName(productUrl, platform) || '未知商品';
        const isSaved = getAllProducts().some(p => p.productUrl === productUrl);
        const isCertified = hasProductBeenCertified(productUrl);
        const triggerBtn = document.createElement('button');
        triggerBtn.id = 'productInfoTrigger';
        triggerBtn.textContent = `商品信息 ▶`;
        triggerBtn.style.cssText = `
            position: fixed;
            bottom: 40px;
            right: 40px;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px 0 0 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 999998;
            font-size: 14px;
        `;
        document.body.appendChild(triggerBtn);
        updateProductInfoBtnState();
        makeElementDraggable(triggerBtn, PRODUCT_INFO_POS_KEY, (newPos) => {
            const popup = document.getElementById('productInfoPopup');
            if (popup) {
                const rect = triggerBtn.getBoundingClientRect();
                popup.style.bottom = (window.innerHeight - rect.top) + 'px';
                popup.style.right = (window.innerWidth - rect.right) + 'px';
            }
        });

        let isPopupVisible = false;
        triggerBtn.addEventListener('click', () => {
            const authState = checkAuthState();
            if (!authState.isAuthenticated) {
                showToast('请先到官网完成用户登录认证', 'error', true);
                return;
            }

            isPopupVisible = !isPopupVisible;
            if (isPopupVisible) {
                popup.style.display = 'block';
                popup.style.animation = 'slideInRight 0.3s ease-out forwards';
                triggerBtn.textContent = `商品信息 ◀`;
            } else {
                popup.style.animation = 'slideOutRight 0.3s ease-out forwards';
                setTimeout(() => {
                    popup.style.display = 'none';
                }, 300);
                triggerBtn.textContent = `商品信息 ▶`;
            }
        });
        const popup = document.createElement('div');
        popup.id = 'productInfoPopup';
        popup.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: -400px;
            background: white;
            border-radius: 8px 0 0 8px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                        z-index: 999997;
            max-width: 350px;
            display: none;
            animation: slideOutRight 0.3s ease-out;
        `;
        const adjustPopupPosition = () => {
            const rect = triggerBtn.getBoundingClientRect();
            popup.style.bottom = (window.innerHeight - rect.top) + 'px';
            popup.style.right = (window.innerWidth - rect.right) + 'px';
        };
        adjustPopupPosition();
        window.addEventListener('resize', () => {
            if (isPopupVisible) {
                adjustPopupPosition();
            }
        });

        // 认证状态判断
        const authState = checkAuthState();
        const certBtnText = !authState.isAuthenticated ? '需先完成认证' : (isCertified ? '已申请公证' : '申请公证');
        const certBtnBg = !authState.isAuthenticated ? '#9E9E9E' : (isCertified ? '#9E9E9E' : '#2196F3');
        const certBtnDisabled = !authState.isAuthenticated || isCertified;
        const saveBtnDisabled = !authState.isAuthenticated;
        const saveBtnBg = saveBtnDisabled ? '#9E9E9E' : (isSaved ? '#9E9E9E' : '#4CAF50');
        const saveBtnText = saveBtnDisabled ? '需先完成认证' : (isSaved ? '已保存' : '保存信息');
        popup.innerHTML = `
            <h3 style="margin-top: 0; color: ${
                platform === '淘宝' ? '#FF4400' :
                platform === '天猫' ? '#FF0036' :
                platform === '拼多多' ? '#E02E24' : '#E31436'
            }; font-size: 16px;">${platform}商品信息</h3>
            <p style="margin: 8px 0; font-size: 13px; color: #666;">
                <strong>平台:</strong><br><span id="platform">${platform}</span>
            </p>
            <p style="margin: 8px 0; font-size: 13px; color: #666; max-height: 60px; overflow: auto; word-break: break-all;">
                <strong>商品名称:</strong><br><span id="productName">${productName}</span>
            </p>
            <p style="margin: 8px 0; font-size: 13px; color: #666;">
                <strong>店铺名称:</strong><br><span id="shopName">${shopName || '获取失败'}</span>
            </p>
            <p style="margin: 8px 0; font-size: 13px; color: #666;">
                <strong>销量:</strong><br><span id="salesCount">${extraData.salesCount || '未知'}</span>
            </p>
            <p style="margin: 8px 0; font-size: 13px; color: #666; max-height: 80px; overflow: auto; word-break: break-all;">
                <strong>商品链接:</strong><br><span id="productUrl">${productUrl}</span>
            </p>
            <!-- 操作按钮横向排列（保持与表格操作列风格统一） -->
            <div class="action-btn-group" style="margin-top: 15px; width: 100%;">
                <button id="saveProduct" style="
                    flex: 1;
                    background: ${saveBtnBg};
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 4px;
                    cursor: ${saveBtnDisabled ? 'not-allowed' : 'pointer'};
                    font-size: 13px;
                    opacity: ${saveBtnDisabled ? 0.7 : 1};
                " ${saveBtnDisabled ? 'disabled' : ''}>${saveBtnText}</button>
                <button id="certifyProduct" style="
                    flex: 1;
                    background: ${certBtnBg};
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 4px;
                    cursor: ${certBtnDisabled ? 'not-allowed' : 'pointer'};
                    font-size: 13px;
                    opacity: ${certBtnDisabled ? 0.7 : 1};
                " ${certBtnDisabled ? 'disabled' : ''}>${certBtnText}</button>
            </div>
        `;
        document.body.appendChild(popup);
        document.getElementById('saveProduct').addEventListener('click', () => {
            const saveBtn = document.getElementById('saveProduct');
            if (saveBtn.disabled) return;

            if (saveBtn.textContent.trim() === '已保存') {
                showToast('该商品信息已保存，无需重复操作', 'info');
                return;
            }

            const productData = {
                platform: platform,
                shopName: shopName || '未知店铺',
                productName: productName,
                productUrl: productUrl,
                salesCount: extraData.salesCount || '未知'
            };
            const result = saveProductInfo(productData);
            if (result.success) {
                saveBtn.textContent = '已保存';
                saveBtn.style.background = '#9E9E9E';
            }
        });

        document.getElementById('certifyProduct').addEventListener('click', () => {
            const certBtn = document.getElementById('certifyProduct');
            if (certBtn.disabled) return;

            if (certBtn.textContent.trim() === '已申请公证') {
                showToast('该商品已完成公证，无需重复操作', 'info');
                return;
            }

            const products = getAllProducts();
            let product = products.find(p => p.productUrl === productUrl);
            if (!product) {
                const productData = {
                    platform: platform,
                    shopName: shopName || '未知店铺',
                    productName: productName,
                    productUrl: productUrl,
                    salesCount: extraData.salesCount || '未知'
                };
                const saveResult = saveProductInfo(productData);
                if (saveResult.success) {
                    product = saveResult.product;
                } else {
                    showToast('保存商品信息失败，无法进行公证操作', 'error');
                    return;
                }
            }
            sendCertificationRequest(product)
                .then(response => {
                    if (response.success) {
                        certBtn.textContent = '已申请公证';
                        certBtn.style.background = '#9E9E9E';
                    } else if (response.isAuthError) {
                        // 如果是认证错误，关闭弹窗并刷新按钮状态
                        popup.style.display = 'none';
                        triggerBtn.textContent = `商品信息 ▶`;
                    }
                });
        });

        if (!extraData.salesCount) {
            getSalesCount(platform).then(salesCount => {
                if (salesCount && salesCount !== '未知') {
                    document.getElementById('salesCount').textContent = salesCount;
                    extraData.salesCount = salesCount;
                }
            });
        }
    };

    const main = async () => {
        try {
            log("脚本开始执行...");
            const currentUrl = window.location.href;
            const platform = getPlatformInfo(currentUrl);
            log(`当前平台: ${platform}`);
            addGlobalStyles();
            createControlButtons();

            if (['淘宝', '天猫', '拼多多', '京东'].includes(platform)) {
                log(`开始提取${platform}商品信息`);
                let shopName = await getShopName(platform);
                let salesCount = await getSalesCount(platform);
                showProductInfo(currentUrl, shopName, platform, { salesCount: salesCount });
                log(`商品信息按钮已创建（默认禁用）`);
            }
            else if (platform === '认证平台') {
                const authState = checkAuthState();
                if (!authState.isAuthenticated) {
                    setTimeout(() => {
                        showToast('请点击"获取认证信息"以启用全部功能', 'info');
                    }, 1000);
                } else {
                    showToast('您已完成认证，可以使用所有功能', 'success');
                }
            }

            log("脚本初始化完成");
        } catch (error) {
            log("主程序执行出错:", error);
            showToast(`脚本初始化失败: ${error.message}`, 'error');
        }
    };
    main();
})();
