"use strict";

import * as FS from "./fs.js";
import * as Def from "./def.js";

let s_optionTabId = -1;
let s_limitSize = 200 * 1024;
let s_uuid = self.crypto.randomUUID();

let s_captureFlag = true;



function contentType2Kind( contentType ) {
    if ( contentType && contentType != "" ) {
        contentType = Def.normlizeContentType( contentType );
        for ( const kind of Object.keys( Def.kind2ContentTypeSet ) ) {
            let mimeSet = Def.kind2ContentTypeSet[ kind ];
            if ( mimeSet.has( contentType ) ) {
                return kind;
            }
        }
    }
    return "etc";
}

browser.runtime.onMessage.addListener( (msg, sender, sendResponse) => {
    if ( msg.type == "onview" ) {
        s_optionTabId = msg.info;
        registerListener();
        sendResponse( s_uuid );
    } else if ( msg.type == "capture" ) {
        s_captureFlag = msg.info;
    } else if ( msg.type == "limit-size" ) {
        s_limitSize = msg.info * 1024;
    }
});


browser.browserAction.onClicked.addListener( async () => {
    try {
        await browser.runtime.sendMessage( { type: "init" } );
    } catch (err) {
        let activeTab = (await browser.tabs.query({active: true, currentWindow: true}))[0];
        let createdTab = await browser.tabs.create(
            {
                url: `./options.html?tabid=${activeTab.id}`
            }
        );

        browser.tabs.onRemoved.addListener( (tabId, removeInfo)=>{
            if ( tabId == s_optionTabId ) {
                s_optionTabId = -1;
                console.log( "remove" );
                removeListener();
            }
        });
    }
});

function setRequestFilter( reqId ) {
    let filter = browser.webRequest.filterResponseData(reqId);
    const info = {
        id:reqId,
        length: 0,
        dataList: [],
        result: false,
    };
    filter.ondata = (event) => {
        filter.write( event.data );
        info.length += event.data.byteLength;
        if ( info.length < s_limitSize ) {
            info.dataList.push( event.data );
        } else {
            info.dataList = null;
        }
    };

    function sendResult(event,result) {
        info.result = result;
        console.log( `stop: ${info.id}, ${info.length}` );
        filter.close();
        browser.runtime.sendMessage( {
            "type": "respData",
            "info": info
        } );
    }
    
    filter.onstop = (event)=> {
        sendResult( event, true );
    };
    filter.onerr = (event)=>{
        sendResult( event, false );
    };
}

function rewriteHeader( info ) {
    // X-my-rewrite- で始まる名前の Header を X-my-rewrite- を取って上書き。
    // 主に Origin を上書く。
    const rewriteKey = `X-my-rewrite-${s_uuid}-`.toLowerCase();
    const newReqHeaders = [];
    let rewrite = false;
    info.requestHeaders.forEach( (header)=>{
        const key = header.name;
        if ( key.toLowerCase().startsWith( rewriteKey ) ) {
            newReqHeaders.push( { name: key.substring( rewriteKey.length ),
                                  value: header.value } );
            rewrite = true;
        } else {
            newReqHeaders.push( header );
        }
    });
    if ( !rewrite ) {
        return {};
    }
    return { requestHeaders: newReqHeaders };
}

function sendMsg( msg ) {
    browser.runtime.sendMessage( msg );
}

function sendReqInfo( info, type ) {
    if ( s_optionTabId == info.tabId || info.tabId == -2 ) {
        if ( s_optionTabId == info.tabId ) {
            if ( type == "reqSend" ) {
                return rewriteHeader( info );
            }
        }
        return {};
    }

    if ( !s_captureFlag ) {
        return {};
    }

    if ( type == "reqSend" ) {
        setRequestFilter( info.requestId );
    }
    
    const msg = {
        tabId: info.tabId,
        id: info.requestId,
        url: info.url,
        code: info.statusCode,
        respHeader: info.responseHeaders,
        reqHeader: info.requestHeaders,
        method: info.method,
        content_type: "",
    };
    if( type == "req" ) {
        //console.log( type, info );
    }
    if ( info.responseHeaders ) {
        info.responseHeaders.forEach( (header)=>{
            if ( header[ "name" ].toLowerCase() == "content-type" ) {
                msg.content_type = header[ "value" ];
            }
        });
        msg.kind = contentType2Kind( msg.content_type );
    }

    sendMsg( { "type": type, "info": msg, } );


    if ( type == "reqSend" ) {
        return rewriteHeader( info );
    }
    
    return {};
}

function reqStart( info ) {
    return sendReqInfo(info,"req");
}
function reqSend( info ) {
    return sendReqInfo(info,"reqSend");
}
function reqEnd( info ) {
    return sendReqInfo(info,"reqEnd");
}
function reqErr( info ) {
    return sendReqInfo(info,"reqErr");
}

function registerListener() {
    browser.webRequest.onBeforeSendHeaders.addListener(
        reqSend,
        {
            urls: [ "*://*/*" ],
        },
        ["blocking", "requestHeaders"],
    );
    
    browser.webRequest.onResponseStarted.addListener(
        reqStart,
        {
            urls: [ "*://*/*" ],
        },
        [ "responseHeaders" ]
    );

    browser.webRequest.onCompleted.addListener(
        reqEnd,
        {
            urls: [ "*://*/*" ],
        }
    );

    browser.webRequest.onErrorOccurred.addListener(
        reqErr,
        {
            urls: [ "*://*/*" ],
        }
    );
}

function removeListener() {
    //browser.webRequest.onBeforeRequest.removeListener( onBeforeRequest );
    browser.webRequest.onBeforeSendHeaders.removeListener( reqSend );
    browser.webRequest.onResponseStarted.removeListener( reqStart );
    browser.webRequest.onCompleted.removeListener( reqEnd );
    browser.webRequest.onErrorOccurred.removeListener( reqErr );
}

async function init() {
    await FS.removeDir( "downloads" );
}
init();
