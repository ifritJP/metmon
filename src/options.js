"use strict";

import * as DL from "./download.js";
import * as Def from "./def.js";


const s_hlsContentTypeSet = new Set( [
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
]);

function isHlsContentType( contentType ) {
    if ( contentType && contentType != "" ) {
        contentType = contentType.toLowerCase();
        let tokens = contentType.split( ";" );
        if ( tokens.length > 1 ) {
            contentType = tokens[ 0 ];
        }
        return s_hlsContentTypeSet.has( contentType );
    }
    return false;
}


const kind2filter = {};
let s_uuid;

function dispRow( table, rowList, filterTabId ) {
    const work = rowList.filter( (row)=>{
        if ( ( filterTabId == -10 || row.tabId == filterTabId ) &&
             kind2filter[ row.kind ] ) {
            return true;
        }
        return false;
    });

    table.addData( work );
}

async function updateKind( row ) {
    if ( row.kind == "etc" && row.content_type == "" ) {
        let newKind = row.kind;
        const txt = await getTxtFromInfo( row, 100 );
        if ( txt.startsWith( "#EXTM3U" ) ) {
            newKind = "streaming";
        }
        if ( newKind != row.kind ) {
            row.kind = newKind;
            return true;
        }
    }
    return false;
}

function makeRow( stockInfo, stockInfo2, info ) {
    const row = {
        tabId: info.tabId,
        id: info.id,
        code: info.code,
        url: info.url,
        method: info.method,
        content_type: info.content_type,
        kind: info.kind,
        size: info.length,
        info: info,
    };
    if ( stockInfo.has( info.id ) ) {
        const stock = stockInfo.get( info.id );
        stockInfo.delete( info.id );
        row.size = stock.length;
        row.dataList = stock.dataList;
        updateKind( row );
    }
    if ( stockInfo2.has( info.id ) ) {
        row.reqHeader = stockInfo2.get( info.id ).reqHeader;
        stockInfo2.delete( info.id );
    }
    return row;
}

function addRow( stockInfo, stockInfo2, table, info, filterTabId ) {
    let row = makeRow( stockInfo, stockInfo2, info );
    dispRow( table, [ row ], filterTabId );
    return row;
}


async function init() {
}

{
    init();
}

async function getTxtFromInfo( info, max ) {
    let textlist = [];
    let len = 0;
    if ( info.dataList ) {
        if ( max ) {
            let size = 0;
            let blob = new Blob( info.dataList.filter( (data)=>{
                let result = size <= max;
                size += data.byteLength;
                return result;
            } ) );
            return await blob.text();
        } else {
            let blob = new Blob( info.dataList );
            return await blob.text();
        }
    }
    return "";
}

async function updateRow( row ) {
    let work = {};
    work[ `log_${row.id}` ] = row;
    await browser.storage.session.set( work );
}

const s_excludeHeaderNames = new Set( [
    "host",
    "user-agent",
    "accept-charset", 
    "accept-encoding", 
    "access-control-request-headers", 
    "access-control-request-method", 
    "connection", 
    "content-length", 
    "cookie", 
    "cookie2", 
    "date", 
    "dnt", 
    "expect", 
    "keep-alive", 
    "origin", 
    "referer", 
    "te", 
    "trailer", 
    "transfer-encoding", 
    "upgrade", 
    "via",
]);
function normalizeHeader( headerList ) {
    const headers = [];
    headerList.forEach( (header)=>{
        let key = header.name.toLowerCase();
        if ( !s_excludeHeaderNames.has( key ) ) {
            if ( !key.startsWith( "sec-" ) && !key.startsWith( "proxy-" ) ) {
                headers.push( header );
            }
        }
    });
    return headers;
}
function getHeaderFor( headerList, name ) {
    let val;
    headerList.forEach( (header)=>{
        if ( header.name.toLowerCase() == name.toLowerCase() ) {
            val = header.value;
        }
    } );
    return val;
}

window.addEventListener(
    "load",
    ()=>{
        // Tabulatorを初期化

        const id2row = new Map();
        let filterTabId = -10;
        
        // curl コマンドとしてクリップボードにコピーする
        function copy2curl( data ) {
            let command = `curl '${data.url}'`;
            data.reqHeader.forEach( (header)=>{
                command += ` -H '${header[ "name" ]}: ${header["value"]}'`;
            });
            command += ` --output ${DL.getFilenameWithDate()}.bin`;
            navigator.clipboard.writeText( command );
        }
        function filter( data ) {
            filterTabId = data.tabId;
            table.clearData();
            const list = [ ...id2row.keys() ];
            list.sort();
            dispRow( table, list.map( (id)=>id2row.get( id ) ), filterTabId );
            let header_el =
                document.querySelector( '.tabulator-col[tabulator-field="tabId"]' );
            header_el.classList.add( "filtered-header" );
        }
        async function download( data ) {
            let hlsFlag = false;
            if ( isHlsContentType( data.content_type ) ) {
                hlsFlag = true;
            } else if ( data.content_type == "" ) {
                const txt = await getTxtFromInfo( data, 100 );
                if ( txt.startsWith( "#EXTM3U" ) ) {
                    hlsFlag = true;
                }
            }
            console.log( "download", data, hlsFlag );
            if ( hlsFlag ) {
                const tab = await browser.tabs.get( data.tabId );
                const headers = new Headers();
                normalizeHeader( data.reqHeader ).forEach( (header)=>{
                    headers.append( header[ "name" ], header[ "value" ] );
                });

                let rewritePrefix = `X-my-rewrite-${s_uuid}-`;
                // origin を上書きさせる
                let origin = getHeaderFor( data.reqHeader, "origin" );
                if ( origin ) {
                    headers.append( `${rewritePrefix}Origin`, origin );
                }
                let referer = getHeaderFor( data.reqHeader, "referer" );
                if ( referer ) {
                    headers.append( `${rewritePrefix}Referer`, referer );
                }
                await DL.downloadFromHls(
                    tab.title, data.url, { headers: headers },
                    rewritePrefix.toLowerCase() );
            } else {
                const anchor = document.createElement("a");
                if ( data.dataList ) {
                    let blob = new Blob( data.dataList );
                    anchor.href = URL.createObjectURL( blob );
                } else {
                    anchor.href = data.url;
                }
                let url = new URL( data.url );
                anchor.download = url.pathname.replace( /.*\/([^\/]+)$/,"$1" );
                anchor.click();

                // android 版 firefox では downloads.download() が使えない 
                // const opt = {};
                // opt.url = data.url;
                // opt.headers = normalizeHeader( data.reqHeader );

                // console.log( opt );
                // let resp = await browser.downloads.download( opt );
                // console.log( resp );
            }
        }
        async function viewItem( data ) {
            if ( data.dataList ) {
                const viewer = document.querySelector( ".resource-viewer" );
                viewer.hidden = false;

                const close_el = document.querySelector( ".resource-viewer input" );
                close_el.addEventListener(
                    "click",
                    ()=>{
                        viewer.hidden = true;
                    }
                );

                const textarea = document.querySelector( ".resource-viewer textarea" );
                const img = document.querySelector( ".resource-viewer img" );
                
                if ( data.kind == "image" ) {
                    textarea.hidden = true;
                    img.hidden = false;
                    let blob = new Blob( data.dataList );
                    img.src = URL.createObjectURL( blob );
                } else {
                    textarea.value = await getTxtFromInfo( data );
                    textarea.hidden = false;
                    img.hidden = true;
                }
            }
        }

        let rowMenu = [
            {
                label: "<div class='menu-item'>copy as a curl command</div>",
                action:(e, row)=>{
                    copy2curl( row.getData() );
                }
            },
            {
                label: "<div class='menu-item'>filter by tabId</div>",
                action:(e, row)=>{
                    filter( row.getData() );
                }
            },
            {
                label: "<div class='menu-item'>download this</div>",
                action: (e,row)=>{
                    download( row.getData() );
                }
            },
            {
                label: `<div class='menu-item'>view this(limited size)</div>`,
                action: async (e,row)=>{
                    await viewItem( row.getData() );
                }
            },
        ];
        
        let clickedId = "";
        let table = new Tabulator("#network-log", {
            data: [], // データ
            //rowClickPopup:rowPopupFormatter, //add click popup to row
            rowContextMenu:rowMenu,
            layout:"fitColumns",
            columns: [ // 列定義
                {title: "id", field: "id", widthGrow:1},
                {title: "tabId", field: "tabId", widthGrow:1},
                {title: "code", field: "code", widthGrow:1},
                {title: "Method", field: "method", widthGrow:1},
                {title: "URL", field: "url", widthGrow:10},
                {title: "Content-Type", field: "content_type", widthGrow:2},
                {title: "kind", field: "kind", widthGrow:1},
                {title: "size", field: "size", widthGrow:2},
            ],
        });

        table.on("rowClick", (e, row)=>{
            const data = row.getData();
            const detailTxt_el =
                  document.querySelector( "#network-log-detail textarea" );
            detailTxt_el.value = `URL: ${data.url}\n`;
            detailTxt_el.value += `Method: ${data.method}\n`;

            function dumpHeaders( delimit, headerList ) {
                detailTxt_el.value += delimit;
                if ( headerList ) {
                    let sortedList = headerList.toSorted( (header1, header2)=>{
                        if ( header1[ "name" ] > header2[ "name" ] ) {
                            return 1;
                        } else if ( header1[ "name" ] < header2[ "name" ] ) {
                            return -1;
                        }
                        return 0;
                    });
                    sortedList.forEach( (header)=>{
                        detailTxt_el.value +=
                            `${header[ "name" ]}: ${header[ "value" ]}\n`;
                    });
                }
            }

            dumpHeaders(
                "========== request headers ========\n", data.reqHeader );
            dumpHeaders(
                "========== response headers ========\n", data.info.respHeader );
        });
        

        const stockInfo = new Map();
        const stockInfo2 = new Map();

        let reqTotalCount = 0;
        let reqTotalSize = 0;

        function updateTotal( count, size ) {
            reqTotalCount += count;
            reqTotalSize += size;
            document.querySelector( "#capture-total" ).innerHTML =
                `:[${reqTotalCount}/${(reqTotalSize/1024/1024).toFixed(2)}MB]`;
        }

        async function processReq( msg ) {
            let addFlag = false;
            if ( msg.type == "req" ) {
                updateTotal( 1, 0 );
                addFlag = true;
            } else if ( msg.type == "reqSend" ) {
                const row = id2row.get( msg.info.id );
                if ( row ) {
                    row.reqHeader = msg.info.reqHeader;
                    if ( kind2filter[ row.kind ] ) {
                        table.updateData( [{
                            id:row.id,
                            reqHeader: msg.info.reqHeader,
                        }] );
                    }
                    updateRow( row );
                } else {
                    // "req" より先に "respData" が来ることがあるので、
                    // その場合の対応。
                    stockInfo2.set( msg.info.id, msg.info );
                }
            } else if ( msg.type == "reqEnd" ) {
            } else if ( msg.type == "reqErr" ) {
            } else if ( msg.type == "respData" ) {
                if ( msg.info.dataList ) {
                    let blob = new Blob( msg.info.dataList );
                    updateTotal( 0, blob.size );
                }
                const row = id2row.get( msg.info.id );
                if ( row ) {
                    row.size = msg.info.length;
                    row.dataList = msg.info.dataList;
                    
                    if ( kind2filter[ row.kind ] ) {
                        table.updateData( [{
                            id:row.id,
                            size:msg.info.length,
                        }] );
                    }

                    let oldKind = row.kind;
                    if ( await updateKind( row ) ) {
                        // response データから kind を更新した時の処理
                        if ( !kind2filter[ oldKind ] ) {
                            dispRow( table, [ row ], filterTabId );
                        } else {
                            table.updateData( [{
                                id:row.id,
                                kind:row.kind
                            }] );
                        }
                    }
                    updateRow( row );
                } else {
                    // "req" より先に "respData" が来ることがあるので、
                    // その場合の対応。
                    stockInfo.set( msg.info.id, msg.info );
                }
            }
            return addFlag;
        }

        const msgQueue = [];
        // msgQueue 処理の排他用フラグ
        let processingQueue = false;
        async function processQueue() {
            if ( processingQueue ) {
                // 別のタイマーの processingQueue() で処理中なので、
                // ここでは処理せずに戻る
                return true;
            }
            processingQueue = true;
            let list = [];
            while ( msgQueue.length > 0 ) {
                let msg = msgQueue.pop();
                if ( await processReq( msg ) ) {
                    list.push( msg );
                }
            }
            processingQueue = false;

            if ( list.length > 0 ) {
                // 1 行つづテーブルに追加すると重いので、
                // 溜っているデータを一括で追加する
                let rowList = list.map( (msg)=>{
                    let row = makeRow( stockInfo, stockInfo2, msg.info );
                    id2row.set( msg.info.id, row );
                    updateRow( row );
                    return row;
                });

                rowList.sort( (row1,row2)=>{
                    const num1 = parseInt( row1.id );
                    const num2 = parseInt( row2.id );
                    return num1 - num2;
                });
                dispRow( table, rowList, filterTabId );
            }
        }

        browser.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
            if ( msg.type == "init" ) {
                sendResponse( true );
            } else {
                // メッセージ処理が重くならないように、
                // ここでは直接処理せずにキューに詰む
                msgQueue.push( msg );
                setTimeout( ()=>{
                    processQueue();
                }, 1000 );
            }
        });

        {
            const kindList = [
                "kind-html",
                "kind-css",
                "kind-js",
                "kind-data",
                "kind-image",
                "kind-media",
                "kind-streaming",
                "kind-etc"
            ];

            function redrawTable() {
                table.clearData();
                
                const list = [ ...id2row.keys() ];
                list.sort();
                dispRow( table, list.map( (id)=>id2row.get( id ) ), filterTabId );
            }

            function setupFilter( el ) {
                el.addEventListener(
                    "click",
                    async ()=>{
                        kindList.forEach( ( kind )=>{
                            kind2filter[ kind.replace( "kind-", "" ) ] =
                                document.querySelector( "#" + kind ).checked;
                        });
                        await browser.storage.local.set( { filter:kind2filter } );

                        redrawTable();
                    });
            }
            kindList.forEach( ( kind )=>{
                setupFilter( document.querySelector( "#" + kind ) );
            });

            async function applyFilter() {
                const info = await browser.storage.local.get( null );
                console.log( info );
                if ( info && info.filter ) {
                    Object.keys( info.filter ).forEach( (kind)=>{
                        document.querySelector( "#kind-" + kind ).checked =
                            info.filter[ kind ];
                    });
                }

                kindList.forEach( ( kind )=>{
                    kind2filter[ kind.replace( "kind-", "" ) ] = 
                        document.querySelector( "#" + kind ).checked;
                });

                async function readLog() {
                    const logs = await browser.storage.session.get( null );
                    const list = [];
                    Object.keys( logs ).forEach(
                        (key)=>{
                            const row = logs[ key ];
                            list.push( logs[ key ] );
                            id2row.set( row.id, row );
                            let dataSize = 0;
                            if ( row.dataList ) {
                                let blob = new Blob( row.dataList );
                                dataSize = blob.size;
                            }
                            updateTotal( 1, dataSize  );
                        });
                    list.sort( (row1,row2)=>{
                        const num1 = parseInt( row1.id );
                        const num2 = parseInt( row2.id );
                        return num1 - num2;
                    });
                    dispRow( table, list, filterTabId );
                }
                readLog();

                {
                    const tab = await browser.tabs.getCurrent();
                    s_uuid = await browser.runtime.sendMessage(
                        { type: "onview", info:tab.id } );
                }
            }
            applyFilter();

            document.getElementById( "filter-clear" ).addEventListener(
                "click",
                ()=>{
                    filterTabId = -10;
                    let header_el =
                        document.querySelector( '.tabulator-col[tabulator-field="tabId"]' );
                    header_el.classList.remove( "filtered-header" );

                    redrawTable();
                }
            );

            document.getElementById( "clear-log" ).addEventListener(
                "click",
                ()=>{
                    stockInfo.clear();
                    stockInfo2.clear();
                    id2row.clear();
                    browser.storage.session.clear();
                    reqTotalCount = 0;
                    reqTotalSize = 0;
                    updateTotal(0,0);
                    
                    redrawTable();
                });
        }

        async function setupSetting() {
            const info = await browser.storage.local.get( null );
            {
                const max_div_el = document.getElementById( "max_div" );
                const max_div_num_el = document.getElementById( "max_div_num" );
                if ( info && info.setting ) {
                    max_div_el.value = info.setting.max_div;
                    max_div_num_el.innerHTML = `${max_div_el.value}`;
                }
                max_div_el.addEventListener(
                    "input",
                    ()=>{
                        max_div_num_el.innerHTML = `${max_div_el.value}`;
                    });
            }
            {
                const limit_size_el = document.getElementById( "limit-size" );
                const limit_size_num_el = document.getElementById( "limit-size-num" );
                if ( info && info.setting ) {
                    limit_size_el.value = info.setting.limit_size;
                    limit_size_num_el.value = `${limit_size_el.value}`;
                }
                limit_size_el.addEventListener(
                    "input",
                    ()=>{
                        limit_size_num_el.value = limit_size_el.value;
                        browser.runtime.sendMessage(
                            { type:"limit-size", info:limit_size_el.value } );
                        
                    });
            }
        }
        setupSetting();

        document.getElementById( "capture" ).addEventListener(
            "click",
            function () {
                browser.runtime.sendMessage( { type:"capture", info:this.checked } );
            });
    });

window.addEventListener('beforeunload', function(e) {
    if ( DL.isDownloadingNow() ) {
        e.returnValue = 'This extension is downloading now.';
    }
});
