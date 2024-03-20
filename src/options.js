"use strict";

import * as DL from "./download.js";
import * as Def from "./def.js";


const kind2filter = {};

function processReq( info ) {
    //console.log( info );
    // 
}

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

function updateKind( row ) {
    if ( row.kind == "etc" && row.content_type == "" ) {
        let newKind = row.kind;
        const txt = getTxtFromInfo( row, 100 );
        if ( txt.startsWith( "#EXTM3U" ) ) {
            newKind = "media";
        }
        if ( newKind != row.kind ) {
            row.kind = newKind;
            return true;
        }
    }
    return false;
}

function addRow( stockInfo, stockInfo2, table, info, filterTabId ) {
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
        row.b64List = stock.b64List;
        updateKind( row );
    }
    if ( stockInfo2.has( info.id ) ) {
        row.reqHeader = stockInfo2.get( info.id ).reqHeader;
        stockInfo2.delete( info.id );
    }

    dispRow( table, [ row ], filterTabId );
    return row;
}


async function init() {
}

{
    init();
}

function getTxtFromInfo( info, max ) {
    let textlist = [];
    let len = 0;
    if ( info.b64List ) {
        for ( const b64 of info.b64List ) {
            let str = atob( b64 );
            textlist.push( str );
            len += str.length;
            if ( max && len >= max ) {
                break;
            }
        }
    }
    return `${textlist.join("")}`;
}

async function updateRow( row ) {
    let work = {};
    work[ `log_${row.id}` ] = row;
    await browser.storage.session.set( work );
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
            if ( data.content_type == "application/vnd.apple.mpegurl" ) {
                hlsFlag = true;
            } else if ( data.content_type == "" ) {
                const txt = getTxtFromInfo( data, 100 );
                if ( txt.startsWith( "#EXTM3U" ) ) {
                    hlsFlag = true;
                }
            }
            if ( hlsFlag ) {
                const tab = await browser.tabs.get( data.tabId );
                await DL.downloadFromHls( tab.title, data.url );
            } else {
                const anchor = document.createElement("a");
                anchor.href = data.url;
                let url = new URL( data.url );
                anchor.download = url.pathname.replace( /.*\/([^\/]+)$/,"$1" );
                anchor.click();
            }
        }
        function viewItem( data ) {
            const viewer = document.querySelector( ".text-viewer" );
            viewer.hidden = false;

            const close_el = document.querySelector( ".text-viewer input" );
            close_el.addEventListener(
                "click",
                ()=>{
                    viewer.hidden = true;
                }
            );

            const textarea = document.querySelector( ".text-viewer textarea" );
            textarea.value = getTxtFromInfo( data );
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
                label: `<div class='menu-item'>view this(limit ${Def.limitSize/1024}KB)</div>`,
                action: (e,row)=>{
                    viewItem( row.getData() );
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

            dumpHeaders(
                "========== request headers ========\n", data.reqHeader );
            dumpHeaders(
                "========== response headers ========\n", data.info.respHeader );
        });
        

        const stockInfo = new Map();
        const stockInfo2 = new Map();


        browser.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
            if ( msg.type == "init" ) {
                sendResponse( true );
            } else if ( msg.type == "req" ) {
                const row = addRow(
                    stockInfo, stockInfo2, table, msg.info, filterTabId );
                id2row.set( msg.info.id, row );
                updateRow( row );
                processReq( table, msg.info );
            } else if ( msg.type == "reqSend" ) {
                processReq( table, msg.info );
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
                processReq( table, msg.info );
            } else if ( msg.type == "reqErr" ) {
                processReq( table, msg.info );
            } else if ( msg.type == "respData" ) {
                processReq( table, msg.info );
                const row = id2row.get( msg.info.id );
                if ( row ) {
                    row.size = msg.info.length;
                    row.b64List = msg.info.b64List;
                    
                    if ( kind2filter[ row.kind ] ) {
                        table.updateData( [{
                            id:row.id,
                            size:msg.info.length,
                        }] );
                    }

                    let oldKind = row.kind;
                    if ( updateKind( row ) ) {
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
        });

        {
            const kindList = [
                "kind-html",
                "kind-css",
                "kind-js",
                "kind-data",
                "kind-image",
                "kind-media",
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
                        });
                    list.sort( (row1,row2)=>{
                        const num1 = parseInt( row1.id );
                        const num2 = parseInt( row2.id );
                        return num1 - num2;
                    });
                    dispRow( table, list, filterTabId );
                    // table.addData( list );
                }
                readLog();

                {
                    const tab = browser.tabs.getCurrent();
                    await browser.runtime.sendMessage( { type: "onview", info:tab.id } );
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
                    
                    redrawTable();
                });
        }

        async function setupSetting() {
            const info = await browser.storage.local.get( null );
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
        setupSetting();

        document.getElementById( "capture" ).addEventListener(
            "click",
            function () {
                browser.runtime.sendMessage( { type:"capture", info:this.checked } );
            });
    });
