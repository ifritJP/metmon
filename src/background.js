"use strict";

import * as FS from "./fs.js";
import * as Def from "./def.js";

let s_optionTabId = -1;


const s_kind2ContentTypeSet = {
    image: new Set( [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/bmp",
        "image/webp",
        "image/vnd.microsoft.icon",
        "image/x-icon",
        "image/svg+xml",
    ] ),
    media: new Set( [
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/mov",
        "video/avi",
        "video/flv",
        "video/wmv",
        "video/3gp",
        "video/mkv",
        "video/mp2t",
        "application/vnd.apple.mpegurl",
        "application/vnd.yt-ump",
    ] ),
    html: new Set( [
        "text/html",
    ] ),
    css: new Set( [
        "text/css",
    ] ),
    js: new Set( [
        "text/javascript",
        "application/javascript",
    ] ),
    data: new Set( [
        "application/json",
        "application/xml",
        "application/json+protobuf",
    ] ),
};

function contentType2Kind( contentType ) {
    if ( contentType && contentType != "" ) {
        let tokens = contentType.split( ";" );
        if ( tokens.length > 1 ) {
            contentType = tokens[ 0 ];
        }
        for ( const kind of Object.keys( s_kind2ContentTypeSet ) ) {
            let mimeSet = s_kind2ContentTypeSet[ kind ];
            if ( mimeSet.has( contentType ) ) {
                return kind;
            }
        }
    }
    return "etc";
}


browser.browserAction.onClicked.addListener( async () => {
    try {
        await browser.runtime.sendMessage( { type: "init" } );
    } catch (err) {
        registerListener();
        let activeTab = (await browser.tabs.query({active: true, currentWindow: true}))[0];
        let createdTab = await browser.tabs.create(
            {
                url: `./options.html?tabid=${activeTab.id}`
            }
        );
        s_optionTabId = createdTab.id;

        browser.tabs.onRemoved.addListener( (tabId, removeInfo)=>{
            if ( tabId == s_optionTabId ) {
                s_optionTabId = -1;
                console.log( "remove" );
                removeListener();
            }
        });
    }
});

function onBeforeRequest( detail ) {
    if ( s_optionTabId == detail.tabId ) {
        return {};
    }
    
    let filter = browser.webRequest.filterResponseData(detail.requestId);
    const info = {
        id:detail.requestId,
        length: 0,
        dataList: [],
        result: false,
    };
    filter.ondata = (event) => {
        filter.write( event.data );
        info.length += event.data.byteLength;
        if ( info.length < Def.limitSize ) {
            info.dataList.push( event.data );
        } else {
            info.dataList = null;
        }
    };

    function sendResult(event,result) {
        info.result = result;
        console.log( `stop: ${info.id}, ${info.length}` );
        filter.close();
        if ( result && info.dataList ) {
            const b64List = [];
            info.dataList.forEach( (data)=>{
                const dataView = new DataView(data);
                let base64 = btoa(String.fromCharCode.apply(
                    null, new Uint8Array(dataView.buffer)));
                b64List.push( base64 );
            });
            info.b64List = b64List;
        }
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

    return {};    
}

function sendReqInfo( info, type ) {
    if ( s_optionTabId == info.tabId ) {
        return {};
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
            if ( header[ "name" ] == "content-type" ) {
                msg.content_type = header[ "value" ];
            }
        });
        msg.kind = contentType2Kind( msg.content_type );
    }

    browser.runtime.sendMessage( {
        "type": type,
        "info": msg,
    });
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
    browser.webRequest.onBeforeRequest.addListener(
        onBeforeRequest,
        {
            urls: [ "https://*/*" ],
        },
        [ "blocking" ]
    );

    browser.webRequest.onBeforeSendHeaders.addListener(
        reqSend,
        {
            urls: [ "https://*/*" ],
        },
        ["blocking", "requestHeaders"],
    );
    
    browser.webRequest.onResponseStarted.addListener(
        reqStart,
        {
            urls: [ "https://*/*" ],
        },
        [ "responseHeaders" ]
    );

    browser.webRequest.onCompleted.addListener(
        reqEnd,
        {
            urls: [ "https://*/*" ],
        }
    );

    browser.webRequest.onErrorOccurred.addListener(
        reqErr,
        {
            urls: [ "https://*/*" ],
        }
    );
}

function removeListener() {
    browser.webRequest.onBeforeRequest.removeListener( onBeforeRequest );
    browser.webRequest.onBeforeSendHeaders.removeListener( reqSend );
    browser.webRequest.onResponseStarted.removeListener( reqStart );
    browser.webRequest.onCompleted.removeListener( reqEnd );
    browser.webRequest.onErrorOccurred.removeListener( reqErr );
}

async function init() {
    await FS.removeDir( "downloads" );
}
init();
