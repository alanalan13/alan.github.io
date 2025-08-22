// ==UserScript==
// @name         电商平台商品信息助手
// @namespace    http://tampermonkey.net/
// @version      1
// @description  支持淘宝、天猫、拼多多、京东商品信息获取与出证记录管理
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

    const LOGIN_URL = "https://ysc.teamsync.cn/login?redirect=%2Findex";

    const log = (message, data) => {
        const timestamp = new Date().toISOString().slice(11, 23);
        if (data) {
            console.log(`[${timestamp} 商品助手] ${message}`, data);
        } else {
            console.log(`[${timestamp} 商品助手] ${message}`);
        }
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
        if (url.includes('tmall.com')) {
            return '天猫';
        } else if (url.includes('taobao.com')) {
            return '淘宝';
        } else if (url.includes('pinduoduo.com')) {
            return '拼多多';
        } else if (url.includes('jd.com')) {
            return '京东';
        } else if (url.includes('ysc.teamsync.cn')) {
            return '认证平台';
        }
        return '未知平台';
    };

    const handleAdminToken = () => {
        log("开始获取Admin-Token...");

        const cookies = document.cookie.split(';');
        let adminToken = null;

        log("当前页面所有cookie:", document.cookie);

        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            log(`检查cookie: ${name}=${value ? '***' : '空'}`);
            if (name === 'Admin-Token') {
                adminToken = value;
                log("找到Admin-Token");
                break;
            }
        }

        if (adminToken) {
            try {
                GM_setValue('yscAdminToken', adminToken);
                log("已使用GM_setValue保存Admin-Token");
                const savedToken = GM_getValue('yscAdminToken');
                if (savedToken) {
                    showToast(`已获取并保存Admin-Token`, 'success');
                } else {
                    throw new Error("保存后无法读取，可能被浏览器阻止");
                }
            } catch (e) {
                log("使用GM_setValue保存失败，尝试localStorage:", e);
                try {
                    localStorage.setItem('yscAdminToken', adminToken);
                    showToast(`已获取并保存Admin-Token`, 'success');
                } catch (e2) {
                    log("保存Admin-Token失败:", e2);
                    showToast(`获取到Token但保存失败: ${e2.message}`, 'error');
                    alert(`获取到Token但保存失败: ${e2.message}\n请手动复制Token: ${adminToken.substring(0, 10)}...`);
                }
            }
        } else {
            log("未找到Admin-Token cookie");
            showToast('未找到Admin-Token，请确保已登录ysc.teamsync.cn', 'error');
        }
    };
    const checkAdminToken = () => {
        try {
            const tokenFromGM = GM_getValue('yscAdminToken');
            if (tokenFromGM) {
                log("从GM存储中找到Admin-Token");
                return tokenFromGM;
            }
            const tokenFromLS = localStorage.getItem('yscAdminToken');
            if (tokenFromLS) {
                log("从localStorage中找到Admin-Token");
                return tokenFromLS;
            }

            log("未找到任何Admin-Token");
            return null;
        } catch (e) {
            log("检查Admin-Token时出错:", e);
            return null;
        }
    };
    const saveCertificationRecord = (productData, responseData, isSuccess) => {
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
        log(`已保存出证记录 #${newRecord.id}: ${newRecord.productName}`);
        return newRecord;
    };
    const getAllCertificationRecords = () => {
        initStorages();
        return JSON.parse(localStorage.getItem('certificationRecords'));
    };
    const redirectToLogin = () => {
        window.open(LOGIN_URL, '_blank');
        showToast('已打开登录页面，请登录后获取新的Token', 'info');
    };
    const sendCertificationRequest = (productData) => {
        const certificationUrl = "https://ysc.teamsync.cn/prod-api/system/ecTaskYingGood";
        const adminToken = checkAdminToken();

        if (!adminToken) {
            const errorMsg = '未找到Admin-Token，请先在认证平台页面获取';
            log(errorMsg);
            showToast(errorMsg, 'error', true); 
            return Promise.reject(new Error(errorMsg));
        }

        log("使用Admin-Token前10位:", adminToken.substring(0, 10) + "...");
        const authorizationToken = `Bearer ${adminToken}`;
        const certificationData = {
            taskYingId: 1, 
            detailUrl: productData.productUrl,
            shopName: productData.shopName || '商品名称',
            title: productData.productName,
            infringementPlatform: productData.platform,
            salesVolume: productData.salesCount,
        };

        showLoadingToast('正在提交出证请求...');
        log("发送出证请求数据:", certificationData);

        return fetch(certificationUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": authorizationToken
            },
            body: JSON.stringify(certificationData)
        })
        .then(response => {
            log(`出证请求响应状态: ${response.status} ${response.statusText}`);
            if (response.status === 401) {
                hideLoadingToast();
                showToast('认证已过期，请重新登录获取Token', 'error', true);
                try {
                    GM_deleteValue('yscAdminToken');
                    localStorage.removeItem('yscAdminToken');
                } catch (e) {
                    log("清除无效Token失败:", e);
                }
                return Promise.reject(new Error('认证已过期，请重新登录'));
            }
            return response.text().then(text => {
                hideLoadingToast();
                log("出证请求原始响应:", text);
                try {
                    const jsonResponse = JSON.parse(text);
                    return {
                        status: response.status,
                        data: jsonResponse,
                        rawText: text
                    };
                } catch (e) {
                    log("响应解析为JSON失败:", e);
                    return {
                        status: response.status,
                        data: null,
                        rawText: text,
                        parseError: e.message
                    };
                }
            });
        })
        .then(result => {
            let isSuccess = false;
            let message = '';

            if (result.data) {
                if (result.status === 200) {
                    if (result.data.code === 200 || result.data.success) {
                        isSuccess = true;
                        message = '出证请求提交成功';
                        showToast(message, 'success');
                    } else {
                        message = result.data.msg || `出证失败 (业务码: ${result.data.code})`;
                        showToast(message, 'error');
                    }
                } else {
                    message = `请求失败 (HTTP状态: ${result.status})`;
                    showToast(message, 'error');
                }
            } else {
                message = `请求失败: 无法解析服务器响应 - ${result.parseError || '未知错误'}`;
                showToast(message, 'error');
            }

            saveCertificationRecord(productData, result, isSuccess);
            updateCertificationStatus(productData.productUrl);

            return {
                success: isSuccess,
                message: message,
                response: result
            };
        })
        .catch(error => {
            hideLoadingToast();
            const errorMsg = `出证请求错误: ${error.message}`;
            log(errorMsg);
            if (error.message.includes('认证已过期') || error.message.includes('未找到Admin-Token')) {
                showToast(errorMsg, 'error', true);
            } else {
                showToast(errorMsg, 'error');
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
            log(`已保存商品 #${newProduct.id}: ${newProduct.productName} (${newProduct.platform})`);
            showToast(`已保存${newProduct.platform}商品信息`, 'success');

            if (sendCert) {
                sendCertificationRequest(newProduct)
                    .then(response => {
                        console.log("[商品助手] 出证请求响应:", response);
                    })
                    .catch(error => {
                        console.error("[商品助手] 出证请求错误:", error);
                    });
            }

            return { success: true, product: newProduct };
        }
        log(`商品已存在，未重复保存: ${newProduct.productUrl}`);
        showToast('该商品信息已保存，无需重复操作', 'info');
        return { success: false, product: null };
    };

    const updateCertificationStatus = (productUrl) => {
        const popup = document.getElementById('productInfoPopup');
        if (popup) {
            const certifyBtn = popup.querySelector('#certifyProduct');
            if (certifyBtn) {
                const isCertified = hasProductBeenCertified(productUrl);
                if (isCertified) {
                    certifyBtn.textContent = '已出证';
                    certifyBtn.style.background = '#9E9E9E';
                } else {
                    certifyBtn.textContent = '出证';
                    certifyBtn.style.background = '#2196F3';
                }
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
                if (element) {
                    resolve(element);
                    return;
                }

                if (Date.now() - startTime >= timeout) {
                    reject(new Error(`超时未找到元素: ${selector}`));
                    return;
                }

                setTimeout(checkElement, interval);
            };

            checkElement();
        });
    };

    const extractProductName = async (url, platform) => {
        if (document.title && document.title.trim() !== '') {
            if (platform === '拼多多') {
                const title = document.title.trim();
                const bracketMatch = title.match(/【(.*?)】/);
                if (bracketMatch && bracketMatch[1]) {
                    return bracketMatch[1].trim();
                }
                const hyphenMatch = title.split('-')[0].trim();
                if (hyphenMatch && hyphenMatch.length > 5) {
                    return hyphenMatch;
                }
            } else if (platform === '京东') {
                const title = document.title.trim();
                const jdMatch = title.split('_京东')[0].trim();
                if (jdMatch && jdMatch.length > 5) {
                    return jdMatch;
                }
            } else {
                return document.title.split('-')[0].trim();
            }
        }
        if (platform === '拼多多') {
            const productNameSelectors = [
                "span[class*='enable-select']",
                "div[class*='goods-title'] span",
                ".goods-name",
                "[class*='product-title']",
                "[class*='main-title']",
                "[id*='goods-name']",
                "h1[class*='title']",
                "div[class*='detail-title']"
            ];

            for (const selector of productNameSelectors) {
                try {
                    log(`[拼多多] 尝试通过选择器 "${selector}" 获取商品名称`);
                    const element = await waitForElement(selector, 3000);
                    const productName = element.textContent.trim();

                    if (productName && productName.length > 5 &&
                        !productName.includes('http') &&
                        !productName.includes('点击') &&
                        !productName.includes('查看')) {

                        log(`[拼多多] 成功通过选择器 "${selector}" 获取商品名称: ${productName}`);
                        return productName;
                    }
                } catch (err) {
                    log(`[拼多多] 选择器 "${selector}" 获取失败: ${err.message}`);
                }
            }
        } else if (platform === '京东') {
            const productNameSelectors = [
                ".sku-name",                   
                "#product-name",              
                ".item-name",                  
                "h1[class*='product-title']",  
                "[class*='main-title']",       
                "[id*='productName']"          
            ];

            for (const selector of productNameSelectors) {
                try {
                    log(`[京东] 尝试通过选择器 "${selector}" 获取商品名称`);
                    const element = await waitForElement(selector, 3000);
                    const productName = element.textContent.trim();

                    if (productName && productName.length > 5 &&
                        !productName.includes('http') &&
                        !productName.includes('点击')) {

                        log(`[京东] 成功通过选择器 "${selector}" 获取商品名称: ${productName}`);
                        return productName;
                    }
                } catch (err) {
                    log(`[京东] 选择器 "${selector}" 获取失败: ${err.message}`);
                }
            }
        } else {
            const productNameSelectors = [
                "h1[class*='title']",
                ".tb-main-title",
                ".title-text",
                "[class*='product-name']",
                "[id*='J_DetailMeta'] h1"
            ];

            for (const selector of productNameSelectors) {
                try {
                    const element = await waitForElement(selector, 2000);
                    const productName = element.textContent.trim();
                    if (productName && productName.length > 5) {
                        return productName;
                    }
                } catch (err) {
                }
            }
        }

        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);

        if (platform === '拼多多' && params.get('goods_id')) {
            return `拼多多商品 ${params.get('goods_id')}`;
        } else if (platform === '京东') {
            if (url.match(/item\.jd\.com\/(\d+)\.html/)) {
                return `京东商品 ${url.match(/item\.jd\.com\/(\d+)\.html/)[1]}`;
            }
        } else if (params.get('title')) {
            return decodeURIComponent(params.get('title')).slice(0, 50);
        }

        if (['拼多多', '京东'].includes(platform)) {
            try {
                const priceElements = document.querySelectorAll("[class*='price'], [id*='price']");
                for (const priceEl of priceElements) {
                    const prevSibling = priceEl.previousElementSibling;
                    if (prevSibling && prevSibling.textContent.trim().length > 5) {
                        return prevSibling.textContent.trim();
                    }

                    const parent = priceEl.parentElement;
                    if (parent) {
                        const potentialTitles = parent.querySelectorAll('span, div, h1, h2');
                        for (const titleEl of potentialTitles) {
                            const text = titleEl.textContent.trim();
                            if (text.length > 5 && !text.includes('¥')) {
                                return text;
                            }
                        }
                    }
                }
            } catch (err) {
                log(`[${platform}] 扫描价格附近元素失败: ${err.message}`);
            }
        }

        log(`[${platform}] 所有方法都无法获取商品名称`);
        return `未识别商品名称 (${new Date().getTime().toString().slice(-4)})`;
    };

    const getSalesCount = (platform) => {
        let selectors;
        let salesPattern;

        if (platform === '拼多多') {
            selectors = [
                "div[class='AsbGpQv_']",
                "[class*='sales-count']",
                "[class*='sold-num']",
                "[class*='volume']",
                "[class*='sales-amount']",
                "[class*='sell-count']"
            ];
            salesPattern = /(已售|销量|售)\s*([\d.]+[万]+[\+]?)/;
        } else if (platform === '京东') {
            selectors = [
                ".sales-amount",               
                "[class*='sell-count']",       
                "[id*='comment-count']",      
                "[class*='item-comment']",     
                ".count"                       
            ];
          
            salesPattern = /(已售|销量|评价)\s*([\d.]+[万]+[\+]?)/;
        } else {
           
            selectors = [
                "div[class*='salesDesc']",
                ".tm-count",
                ".sale-num",
                ".sell-count",
                ".tm-ind-sellCount .tm-count",
                ".tb-detail-sell-count .tm-count"
            ];
            salesPattern = /(已售|销量|月销)\s*([\d.]+[万]+[\+]?)/;
        }

      
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const salesText = element.innerText.trim();
                if (salesText) {
                    log(`[${platform}] 通过选择器 "${selector}" 获取销量信息: ${salesText}`);
                    const salesMatch = salesText.match(salesPattern);
                    if (salesMatch && salesMatch[2]) {
                        return salesMatch[2];
                    }
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
                            log(`[${platform}] 延迟获取 - 通过选择器 "${selector}" 获取销量信息: ${salesText}`);
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

                log(`[${platform}] 所有选择器都无法获取销量信息`);
                resolve('未知');
            }, 2000);
        });
    };

 
    const getShopName = (platform) => {
        let selectors;

        if (platform === '拼多多') {
            selectors = [
                "div[class='BAq4Lzv7']",
                ".mall-name",
                ".seller-name",
                ".shop-name",
                ".merchant-name",
                "[class*='shop-name']",
                "[class*='mall-name']",
                "[class*='seller-name']",
                "[class*='merchant-name']"
            ];
        } else if (platform === '京东') {
         
            selectors = [
                "div[class='name']",
                ".shop-name",                  
                ".J-hove-wrap",                
                "[class*='seller-name']",      
                "[id*='shopInfoLink']",        
                ".shop-title"                 
            ];
        } else {
            
            selectors = [
                "span[class*='shopName']",
                "a[class*='shopName']",
                ".shop-name > a",
                ".slogo-shopname > a",
                "[data-spm='a220m.1000858']"
            ];
        }

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                const shopName = element.textContent.trim();
                if (shopName && shopName.length > 2) {
                    log(`[${platform}] 通过选择器 "${selector}" 获取到店铺名称: ${shopName}`);
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
                            log(`[${platform}] 延迟获取 - 通过选择器 "${selector}" 获取到店铺名称: ${shopName}`);
                            resolve(shopName);
                            return;
                        }
                    }
                }
                log(`[${platform}] 所有选择器都无法获取店铺名称`);
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
        }
    };

   
    const clearCertificationRecords = () => {
        if (confirm('确定要清空所有出证记录吗？')) {
            localStorage.setItem('certificationRecords', JSON.stringify([]));
            log('已清空所有出证记录');
            showToast('已清空所有出证记录', 'info');
        }
    };

   
    const exportToXLSX = () => {
        const products = getAllProducts();
        if (products.length === 0) {
            showToast('没有可导出的商品信息', 'info');
            return;
        }

        showLoadingToast('正在生成Excel文件...');

        const wsData = [
            ['序号', '平台', '商品名称', '店铺名称', '销量', '商品链接', '添加时间']
        ];

        products.forEach(p => {
            const row = [
                p.id,
                p.platform,
                p.productName,
                p.shopName,
                p.salesCount,
                p.productUrl,
                p.addTime
            ];
            wsData.push(row);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        const wscols = [
            {wch: 6},   
            {wch: 8},  
            {wch: 30},  
            {wch: 20}, 
            {wch: 10},  
            {wch: 50},  
            {wch: 20}   
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "商品列表");

        setTimeout(() => {
            XLSX.writeFile(wb, `商品信息_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
            log(`已导出 ${products.length} 条商品信息到XLSX`);
            hideLoadingToast();
            showToast(`成功导出 ${products.length} 条商品信息到Excel文件`, 'success');
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
            case 'success':
                bgColor = '#4CAF50'; // 绿色
                break;
            case 'error':
                bgColor = '#f44336'; // 红色
                break;
            case 'warning':
                bgColor = '#ff9800'; // 橙色
                break;
            default:
                bgColor = '#2196F3'; // 蓝色
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
                ">去登录</button>
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
                toast.remove();
            }, 3000);
        }
    };

    const addToastStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadein {
                from {top: 0; opacity: 0;}
                to {top: 20px; opacity: 1;}
            }

            @keyframes fadeout {
                from {top: 20px; opacity: 1;}
                to {top: 0; opacity: 0;}
            }
        `;
        document.head.appendChild(style);
    };

    const createControlButtons = () => {
        if (document.getElementById('shoppingControlPanel')) return;

        const panel = document.createElement('div');
        panel.id = 'shoppingControlPanel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999997;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;

        const isYscPage = window.location.href.includes('ysc.teamsync.cn');

        if (isYscPage) {
            const getTokenBtn = document.createElement('button');
            getTokenBtn.textContent = '获取Admin-Token';
            getTokenBtn.style.cssText = `
                background: #9C27B0;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            getTokenBtn.addEventListener('click', handleAdminToken);
            panel.appendChild(getTokenBtn);

            const checkTokenBtn = document.createElement('button');
            checkTokenBtn.textContent = '检查Token状态';
            checkTokenBtn.style.cssText = `
                background: #607D8B;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            checkTokenBtn.addEventListener('click', () => {
                const token = checkAdminToken();
                if (token) {
                    showToast(`Token已存在\n前10位: ${token.substring(0, 10)}...`, 'success');
                } else {
                    showToast('未找到Token，请点击"获取Admin-Token"按钮', 'warning');
                }
            });
            panel.appendChild(checkTokenBtn);
        } else {
            const loginBtn = document.createElement('button');
            loginBtn.textContent = '认证平台登录';
            loginBtn.style.cssText = `
                background: #9C27B0;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            loginBtn.addEventListener('click', redirectToLogin);
            panel.appendChild(loginBtn);

            const exportBtn = document.createElement('button');
            exportBtn.textContent = '导出到Excel(XLSX)';
            exportBtn.style.cssText = `
                background: #2196F3;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            exportBtn.addEventListener('click', exportToXLSX);

            const viewBtn = document.createElement('button');
            viewBtn.textContent = '查看记录';
            viewBtn.style.cssText = `
                background: #FF9800;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            viewBtn.addEventListener('click', showProductList);

            const certRecordBtn = document.createElement('button');
            certRecordBtn.textContent = '出证记录';
            certRecordBtn.style.cssText = `
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            certRecordBtn.addEventListener('click', showCertificationRecords);

            const clearBtn = document.createElement('button');
            clearBtn.textContent = '清空记录';
            clearBtn.style.cssText = `
                background: #f44336;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            clearBtn.addEventListener('click', clearProductStorage);

            panel.appendChild(exportBtn);
            panel.appendChild(viewBtn);
            panel.appendChild(certRecordBtn);
            panel.appendChild(clearBtn);
        }

        document.body.appendChild(panel);
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #333;">出证记录 (${records.length} 条)</h2>
                <div>
                    <button id="clearCertRecordsBtn" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-right: 10px;
                    ">清空记录</button>
                    <button id="closeCertRecordsBtn" style="
                        background: #607D8B;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 4px;
                        cursor: pointer;
                    ">关闭</button>
                </div>
            </div>
        `;

        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        `;

        table.innerHTML = `
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 5%;">序号</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 5%;">平台</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 30%;">商品名称</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 15%;">出证时间</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 10%;">状态</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 35%;">操作</th>
                </tr>
            </thead>
            <tbody id="certRecordsTableBody">
                ${records.length === 0 ? `
                    <tr>
                        <td colspan="6" style="border: 1px solid #ddd; padding: 20px; text-align: center;">
                            暂无出证记录
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
            row.style.backgroundColor = record.id % 2 === 0 ? '#fff' : '#f9f9f9';

            row.innerHTML = `
                <td style="border: 1px solid #ddd; padding: 10px;">${record.id}</td>
                <td style="border: 1px solid #ddd; padding: 10px;">
                    <span style="color: ${
                        record.platform === '淘宝' ? '#FF4400' :
                        record.platform === '天猫' ? '#FF0036' :
                        record.platform === '拼多多' ? '#E02E24' : '#E31436'
                    }">${record.platform}</span>
                </td>
                <td style="border: 1px solid #ddd; padding: 10px;">${record.productName}</td>
                <td style="border: 1px solid #ddd; padding: 10px;">${record.requestTime}</td>
                <td style="border: 1px solid #ddd; padding: 10px;">
                    <span style="color: ${record.isSuccess ? '#4CAF50' : '#f44336'}">${record.isSuccess ? '成功' : '失败'}</span>
                </td>
                <td style="border: 1px solid #ddd; padding: 10px;">
                    <a href="${record.productUrl}" target="_blank" style="
                        color: #2196F3;
                        margin-right: 10px;
                        text-decoration: none;
                    ">查看商品</a>
                    <button class="viewCertDetails" data-id="${record.id}" style="
                        background: #2196F3;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        margin-right: 5px;
                    ">查看详情</button>
                    ${!record.isSuccess ? `
                    <button class="retryCertification" data-id="${record.id}" style="
                        background: #ff9800;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        margin-right: 5px;
                    ">重试</button>
                    ` : ''}
                    <button class="deleteCertRecord" data-id="${record.id}" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    ">删除</button>
                </td>
            `;

            tableBody.appendChild(row);
        });

        document.getElementById('closeCertRecordsBtn').addEventListener('click', () => modal.remove());

        document.getElementById('clearCertRecordsBtn').addEventListener('click', () => {
            clearCertificationRecords();
            modal.remove();
        });

        document.querySelectorAll('.viewCertDetails').forEach(btn => {
            btn.addEventListener('click', function() {
                const recordId = parseInt(this.getAttribute('data-id'));
                const records = getAllCertificationRecords();
                const record = records.find(r => r.id === recordId);

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
                            <h3 style="margin: 0; color: #333;">出证详情 #${record.id}</h3>
                            <button class="closeDetailsBtn" style="
                                background: #f44336;
                                color: white;
                                border: none;
                                padding: 5px 10px;
                                border-radius: 3px;
                                cursor: pointer;
                            ">关闭</button>
                        </div>
                        <p><strong>商品名称:</strong> ${record.productName}</p>
                        <p><strong>平台:</strong> ${record.platform}</p>
                        <p><strong>出证时间:</strong> ${record.requestTime}</p>
                        <p><strong>状态:</strong> <span style="color: ${record.isSuccess ? '#4CAF50' : '#f44336'}">${record.isSuccess ? '成功' : '失败'}</span></p>
                        <p><strong>商品链接:</strong> <a href="${record.productUrl}" target="_blank">${record.productUrl}</a></p>
                        <p><strong>响应数据:</strong></p>
                        <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px;">${JSON.stringify(record.response, null, 2)}</pre>
                    `;

                    detailsModal.appendChild(detailsContainer);
                    document.body.appendChild(detailsModal);

                    detailsModal.querySelector('.closeDetailsBtn').addEventListener('click', () => {
                        detailsModal.remove();
                    });
                }
            });
        });

        document.querySelectorAll('.retryCertification').forEach(btn => {
            btn.addEventListener('click', function() {
                const recordId = parseInt(this.getAttribute('data-id'));
                const records = getAllCertificationRecords();
                const record = records.find(r => r.id === recordId);

                if (record) {
                    const products = getAllProducts();
                    const product = products.find(p => p.productUrl === record.productUrl);

                    if (product) {
                        sendCertificationRequest(product)
                            .then(response => {
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
                const records = getAllCertificationRecords();
                const newRecords = records.filter(r => r.id !== recordId);
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #333;">已保存商品 (${products.length} 个)</h2>
                <button id="closeListBtn" style="
                    background: #f44336;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    cursor: pointer;
                ">关闭</button>
            </div>
        `;

        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        `;

        table.innerHTML = `
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 5%;">序号</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 5%;">平台</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 20%;">商品名称</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 15%;">店铺名称</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 10%;">销量</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 28%;">商品链接</th>
                    <th style="border: 1px solid #ddd; padding: 10px; text-align: left; width: 17%;">操作</th>
                </tr>
            </thead>
            <tbody id="productTableBody">
                ${products.length === 0 ? `
                    <tr>
                        <td colspan="7" style="border: 1px solid #ddd; padding: 20px; text-align: center;">
                            暂无保存的商品信息
                        </td>
                    </tr>
                ` : ''}
            </tbody>
        `;

        container.appendChild(table);
        modal.appendChild(container);
        document.body.appendChild(modal);

        const tableBody = document.getElementById('productTableBody');
        products.forEach((product, index) => {
            const isCertified = hasProductBeenCertified(product.productUrl);

            const row = document.createElement('tr');
            row.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f9f9f9';

            row.innerHTML = `
                <td style="border: 1px solid #ddd; padding: 10px;">${product.id}</td>
                <td style="border: 1px solid #ddd; padding: 10px;">
                    <span style="color: ${
                        product.platform === '淘宝' ? '#FF4400' :
                        product.platform === '天猫' ? '#FF0036' :
                        product.platform === '拼多多' ? '#E02E24' : '#E31436'
                    }">${product.platform}</span>
                </td>
                <td style="border: 1px solid #ddd; padding: 10px;">${product.productName}</td>
                <td style="border: 1px solid #ddd; padding: 10px;">${product.shopName}</td>
                <td style="border: 1px solid #ddd; padding: 10px; font-weight: 500;">
                    ${product.salesCount}
                </td>
                <td style="border: 1px solid #ddd; padding: 10px; word-break: break-all;">
                    <a href="${product.productUrl}" target="_blank" style="color: #2196F3;">查看商品</a>
                </td>
                <td style="border: 1px solid #ddd; padding: 10px;">
                    <button class="certifyProduct" data-id="${product.id}" style="
                        background: ${isCertified ? '#9E9E9E' : '#4CAF50'};
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        margin-right: 5px;
                    ">${isCertified ? '已出证' : '出证'}</button>
                    <button class="deleteProduct" data-id="${product.id}" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    ">删除</button>
                </td>
            `;

            tableBody.appendChild(row);
        });

        document.getElementById('closeListBtn').addEventListener('click', () => modal.remove());

        document.querySelectorAll('.certifyProduct').forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.textContent.trim() === '已出证') {
                    return;
                }

                const productId = parseInt(this.getAttribute('data-id'));
                const products = getAllProducts();
                const product = products.find(p => p.id === productId);

                if (product) {
                    sendCertificationRequest(product)
                        .then(response => {
                            console.log("[商品助手] 出证请求响应:", response);
                        })
                        .catch(error => {
                            console.error("[商品助手] 出证请求错误:", error);
                        });
                }
            });
        });

        document.querySelectorAll('.deleteProduct').forEach(btn => {
            btn.addEventListener('click', function() {
                const productId = parseInt(this.getAttribute('data-id'));
                const products = getAllProducts();
                const newProducts = products.filter(p => p.id !== productId);
                newProducts.forEach((p, index) => p.id = index + 1);
                localStorage.setItem('multiPlatformProducts', JSON.stringify(newProducts));
                modal.remove();
                showProductList();
            });
        });
    };

    const showProductInfo = async (productUrl, shopName, platform, extraData = {}) => {
        const existingPopup = document.getElementById('productInfoPopup');
        if (existingPopup) existingPopup.remove();

        const productName = await extractProductName(productUrl, platform) || '未知商品';
        const isSaved = getAllProducts().some(p => p.productUrl === productUrl);
        const isCertified = hasProductBeenCertified(productUrl);

        const popup = document.createElement('div');
        popup.id = 'productInfoPopup';
        popup.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            z-index: 999998;
            max-width: 350px;
            animation: slideIn 0.3s ease-out;
        `;

        const platformSpecificContent = `
            <p style="margin: 10px 0; font-size: 14px; color: #FF4400; font-weight: bold;">
                <strong>销量:</strong><br>
                <span id="salesCount">${extraData.salesCount || '未知'}</span>
            </p>
        `;

        popup.innerHTML = `
            <h3 style="margin-top: 0; color: ${
                platform === '淘宝' ? '#FF4400' :
                platform === '天猫' ? '#FF0036' :
                platform === '拼多多' ? '#E02E24' : '#E31436'
            }; font-size: 16px;">${platform}商品信息</h3>
            <p style="margin: 10px 0; font-size: 14px;">
                <strong>平台:</strong><br>
                <span id="platform">${platform}</span>
            </p>
            <p style="margin: 10px 0; font-size: 14px;">
                <strong>商品名称:</strong><br>
                <span id="productName">${productName}</span>
            </p>
            <p style="margin: 10px 0; font-size: 14px;">
                <strong>店铺名称:</strong><br>
                <span id="shopName">${shopName || '获取失败'}</span>
            </p>
            ${platformSpecificContent}
            <p style="margin: 10px 0; font-size: 14px; max-height: 80px; overflow: auto;">
                <strong>商品链接:</strong><br>
                <span id="productUrl" style="word-break: break-all;">${productUrl}</span>
            </p>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="saveProduct" style="
                    flex: 1;
                    background: ${isSaved ? '#9E9E9E' : '#4CAF50'};
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">${isSaved ? '已保存' : '保存信息'}</button>
                <button id="certifyProduct" style="
                    flex: 1;
                    background: ${isCertified ? '#9E9E9E' : '#2196F3'};
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">${isCertified ? '已出证' : '申请公证'}</button>
                <button id="closeInfo" style="
                    width: 40px;
                    background: ${
                        platform === '淘宝' ? '#FF4400' :
                        platform === '天猫' ? '#FF0036' :
                        platform === '拼多多' ? '#E02E24' : '#E31436'
                    };
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">×</button>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(popup);

        document.getElementById('saveProduct').addEventListener('click', () => {
            const saveBtn = document.getElementById('saveProduct');
            const certifyBtn = document.getElementById('certifyProduct');

            if (saveBtn.textContent.trim() === '已保存') {
                showToast('该商品信息已保存，无需重复操作', 'info');
                return;
            }

            const saveData = {
                platform,
                shopName,
                productName,
                productUrl,
                salesCount: extraData.salesCount
            };

            const result = saveProductInfo(saveData);
            if (result.success) {
                saveBtn.textContent = '已保存';
                saveBtn.style.background = '#9E9E9E';

                certifyBtn.textContent = '出证';
                certifyBtn.style.background = '#2196F3';

                popup.setAttribute('data-product-id', result.product.id);
            }
        });

        document.getElementById('certifyProduct').addEventListener('click', () => {
            const certifyBtn = document.getElementById('certifyProduct');

            if (certifyBtn.textContent.trim() === '已出证') {
                showToast('该商品已出过证，无需重复操作', 'info');
                return;
            }
            const productId = popup.getAttribute('data-product-id');
            let productData;

            // 查找商品数据
            if (productId) {
                const products = getAllProducts();
                productData = products.find(p => p.id === parseInt(productId));
            } else {
                productData = {
                    platform,
                    shopName,
                    productName,
                    productUrl,
                    salesCount: extraData.salesCount,
                    addTime: new Date().toLocaleString()
                };
            }

            if (productData) {
                sendCertificationRequest(productData)
                    .then(response => {
                        console.log("[商品助手] 出证请求响应:", response);
                        if (response.success) {
                            certifyBtn.textContent = '已出证';
                            certifyBtn.style.background = '#9E9E9E';
                        }
                    })
                    .catch(error => {
                        console.error("[商品助手] 出证请求错误:", error);
                    });
            } else {
                showToast('获取商品信息失败，无法出证', 'error');
            }
        });

        document.getElementById('closeInfo').addEventListener('click', () => {
            popup.remove();
        });
    };

    const setupProductClickMonitor = () => {
        document.addEventListener('click', async function(e) {
            let link = e.target.closest('a');
            if (!link) return;

            const url = link.href;
            let platform = getPlatformInfo(url);

            if (['淘宝', '天猫', '拼多多', '京东'].includes(platform)) {
                log(`检测到${platform}商品点击: ${url}`);
                const delayTime = platform === '拼多多' ? 3000 : 2000;

                setTimeout(async () => {
                    if (window.location.href.includes('item.taobao.com') ||
                        window.location.href.includes('detail.tmall.com') ||
                        window.location.href.includes('pinduoduo.com') ||
                        window.location.href.includes('item.jd.com') ||
                        window.location.href.includes('mall.jd.com')) {

                        const productUrl = window.location.href;
                        const currentPlatform = getPlatformInfo(productUrl);
                        const shopName = await getShopName(currentPlatform);
                        const salesCount = await getSalesCount(currentPlatform);
                        showProductInfo(productUrl, shopName, currentPlatform, { salesCount });
                    }
                }, delayTime);
            }
        }, true);
    };

    const main = async () => {
        log('多平台商品信息助手（含出证记录）开始运行 v1.3');
        addToastStyles();

        const domain = window.location.hostname.replace('www.', '').replace('m.', '');
        const platform = getPlatformInfo(window.location.href);
        log(`当前平台: ${platform} (${domain})`);
        if (!['淘宝', '天猫', '拼多多', '京东', '认证平台', '未知平台'].includes(platform)) {
            log(`当前平台不支持: ${domain}`);
            return;
        }
        initStorages();

        createControlButtons();
        if (window.location.href.includes('item.taobao.com') ||
            window.location.href.includes('detail.tmall.com') ||
            window.location.href.includes('pinduoduo.com') ||
            window.location.href.includes('item.jd.com') ||
            window.location.href.includes('mall.jd.com')) {
            const delayTime = platform === '拼多多' ? 3000 : 2000;

            setTimeout(async () => {
                const productUrl = window.location.href;
                const currentPlatform = getPlatformInfo(productUrl);
                const shopName = await getShopName(currentPlatform);
                const salesCount = await getSalesCount(currentPlatform);
                showProductInfo(productUrl, shopName, currentPlatform, { salesCount });
            }, delayTime);
        }


        if (['淘宝', '天猫', '拼多多', '京东'].includes(platform)) {
            setupProductClickMonitor();
        }
    };

    main();
})();

