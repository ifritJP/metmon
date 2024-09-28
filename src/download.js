import * as FS from "./fs.js";
import * as Def from "./def.js";

export function num2Str( fig, num ) {
    return num.toString(10).padStart( fig, '0' );
}

export function url2filename( urltxt, contentType ) {
    contentType = Def.normlizeContentType( contentType );
    const url = new URL( urltxt );
    let ext = Def.contentType2ext[ contentType ];
    if ( ext ) {
        ext = "." + ext;
    } else {
        ext = "";
    }
    return url.pathname.replace( /.*\/([^\/]+)$/,"$1" ) + ext;;    
}

function joinUrl( srcURL, url ) {
    if ( url.startsWith( "http://" ) ||
         url.startsWith( "https://" ) ) {
        // FQDN 指定
    } else if ( url.startsWith( "/" ) ) {
        // 絶対パス指定
        url = srcURL.protocol + "//" + srcURL.host + url;
    } else {
        // 相対パス指定
        let parent = srcURL.pathname.replace( /[^/]+$/, "" );
        url = srcURL.protocol + "//" + srcURL.host + parent + url;
    }
    return url;
}

async function retryDownload( url, opt, retryCount ) {
    let response;
    let count = 0;

    while ( count <= retryCount ) {
        try {
            response = await fetch(url, opt);
        } catch (error) {
            console.error('error:', error);
            throw error;
        }

        if (response.status === 404) {
            throw new Error( "not found -- " + url );
        }

        if (response.ok) {
            return response;
        }
        count++;
    }

    throw new Error( "retry over -- " + command );
}


function downloadFromList( max, list, opt, logFunc, progressFunc ) {

    let promise = new Promise( (resolve, reject)=>{
        let url2blob = new Map();
        // エラーのリトライ回数
        const maxRetry = 3;

        // 平行処理中の数
        let count = 0;

        const remain = list.slice();


        function reqNext() {
            if ( remain.length > 0 ) {
                count++;
                req( remain.shift(), 0 );
            }
        }
        
        function req( url, retryCount ) {
            {
                let len = list.length;
                let count = len - remain.length;
                logFunc( `${count}/${len} -- ${url}` );
            }
            if ( retryCount < maxRetry ) {
                retryCount++;
                fetch( url, opt ).then((resp)=>{
                    if ( resp.status != 200 ) {
                        console.log( `retry -- ${retryCount}:${url}` );
                        setTimeout(()=>{
                            req( url, retryCount );
                        }, retryCount * 1000 );
                    } else {
                        onDownload( url, resp );
                    }
                });
            } else {
                reject( `over retry -- ${url}` );
            }
        }

        let progress = 0;
        function onDownload( url, resp ) {
            resp.blob().then( (blob)=>{
                count--;
                reqNext();
                progress++;
                url2blob.set( url, blob );

                progressFunc( url2blob ).then( (continueFlag)=> {
                    if ( !continueFlag ) {
                        resolve( false );
                    }
                });
                if ( progress == list.length ) {
                    resolve( true );
                }
            });
        }

        while ( remain.length > 0 && count < max ) {
            reqNext();
        }
    });
    return promise;
}

export function getFilenameWithDate() {
    let now = new Date();
    return `${now.getFullYear()}-` +
        `${num2Str( 2, now.getMonth() + 1 )}-` +
        `${num2Str( 2, now.getDate() )}_` +
        `${num2Str( 2, now.getHours() )}-` +
        `${num2Str( 2, now.getMinutes() )}-` +
        `${num2Str( 2, now.getSeconds() )}.` +
        `${num2Str( 3, now.getMilliseconds() )}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const binaryString = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
  return btoa(binaryString);
}

function arrayBufferToHex(buffer) {
  const hexString = Array.from(new Uint8Array(buffer))
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
  return hexString.toUpperCase();
}


async function saveAs( name, blob ) {
    let workUrl = URL.createObjectURL( blob );

    const anchor = document.createElement("a");
    anchor.href = workUrl;
    anchor.download = name;
    anchor.click();
    
    //URL.revokeObjectURL( workUrl );
}

async function createTmpFile( name ) {
    console.log( name );


    const dirObj = await FS.createDir( "downloads" );
    const fileObj = await dirObj.createFile( name );
    const writer = await fileObj.getWritable();

    return [ fileObj, writer ];
}

async function downloadAndJoin( urlList, opt, metaInfo, logFunc, progressFunc ) {
    let date_txt = getFilenameWithDate();
    const ext = ".bin";

    const [ fileObj, writer ] = await createTmpFile( date_txt + ext );


    let cancelFlag = false;

    const max_div_el = document.getElementById( "max_div" );
    const max_div = parseInt( max_div_el.value );


    let index = 0;
    let count = 0;
    cancelFlag = !(await downloadFromList(
        max_div, urlList, opt, logFunc,
        async (url2blob)=>{
            count++;
            if ( !progressFunc( count ) ) {
                return false;
            }

            while ( index < urlList.length ) {
                let url = urlList[ index ];
                if ( url2blob.has( url ) ) {
                    index++;
                    logFunc( `write a packet to the filesystem.  -- ${index}/${urlList.length}` );
                    await writer.write( url2blob.get( url ) );
                } else {
                    break;
                }
            }
            return true;
        }));
    
    await writer.close();
    
    if ( !cancelFlag ) {
        let blob = await fileObj.getBlob();
        logFunc( "save" );
        await saveAs( `${date_txt}${ext}`, blob );
        await saveAs( `${date_txt}.json`, new Blob( [ JSON.stringify( metaInfo ) ] ) );
    } else {
        fileObj.remove();
    }

    return fileObj;
}

function addProgress( title, progress_max, cancel_cb ) {
    const div_el = document.getElementById( "progress" );

    const dummy_el = document.createElement( "div" );
    div_el.append( dummy_el );

    let range_txt = `max="${progress_max}" value="0"`;
    if (!progress_max) {
        range_txt = "";
    }
    
    dummy_el.innerHTML = `
<input type="button" value="cancel" > <input type="button" value="remove tmp file" >
<div>${title}</div>
<input type="text" value="" style="width:100%;">
<progress style="width:100%;" ${range_txt}>
`;

    const remove_el = dummy_el.querySelector( 'input[value="remove tmp file"]' );
    remove_el.hidden = true;
    
    dummy_el.querySelector( 'input[value="cancel"]' ).addEventListener(
        "click",
        ()=>{
            cancel_cb();
            dummy_el.remove();
            console.log( "click cancel" );
        } );


    let progress_text = dummy_el.querySelector( 'input[type="text"]');
    let progress_el = dummy_el.querySelector( "progress" );

    return [remove_el, dummy_el, progress_text, progress_el ];
    
}

async function downloadFromHlsStream( title, url, opt, rewritePrefix ) {
    console.log( "downloadFromHlsStream", title, url, opt );

    let srcURL = new URL( url );

    let resp = await fetch( url, opt );
    let m3u = await resp.text();

    let metaInfo = {};
    metaInfo.userAgent = navigator.userAgent;
    metaInfo.headerList = [];
    
    for (const pair of opt.headers.entries()) {
        let name = pair[0];
        if ( name.toLowerCase().startsWith( rewritePrefix ) ) {
            name = name.substring( rewritePrefix.length );
        }
        metaInfo.headerList.push( { name: name, value: pair[1] } );
    }

    const extInfo = {};
    const urlList = [];
    let hasHeader = false;
    m3u.split( "\n" ).forEach( (line)=>{
        if ( hasHeader ) {
            urlList.push( joinUrl( srcURL, line ) );
            hasHeader = false;
        } else if ( line.startsWith( "#EXTINF:" ) ) {
            hasHeader = true;
        } else if ( line.startsWith( "#EXT-X-" ) ) {
            if ( !line.startsWith( "#EXT-X-ENDLIST" ) ) {
                const index = line.indexOf( ":" );
                extInfo[ line.substring( 0, index ) ] =
                    line.substring( index + 1 );
            }
        }
    });
    metaInfo.extInfo = extInfo;

    
    let cancelFlag = false;
    let [remove_el, dummy_el, progress_text, progress_el ] =
        addProgress( title, urlList.length,
                     ()=>{
                         cancelFlag = true; 
                     } );
    
//     const div_el = document.getElementById( "progress" );

//     const dummy_el = document.createElement( "div" );
//     div_el.append( dummy_el );
//     dummy_el.innerHTML = `
// <input type="button" value="cancel" > <input type="button" value="remove tmp file" >
// <div>${title}</div>
// <input type="text" value="" style="width:100%;">
// <progress style="width:100%;" max="${urlList.length}" value="0">

// `;

//     const remove_el = dummy_el.querySelector( 'input[value="remove tmp file"]' );
//     remove_el.hidden = true;
    
//     let cancelFlag = false;
//     dummy_el.querySelector( 'input[value="cancel"]' ).addEventListener(
//         "click",
//         ()=>{
//             cancelFlag = true;
//             dummy_el.remove();
//             console.log( "click cancel" );
//         } );

    let fileObj = await downloadAndJoin(
        urlList, opt, metaInfo,
        (log)=>{
            progress_text.value = log;
        },
        (progress)=>{
            progress_el.value = progress;
            return !cancelFlag;
        });

    if ( !cancelFlag ) {
        // ブラウザ側のダウンロード完了を検知できないので、手動で削除させる。
        // extension の downloads を使うと検知できるが、
        // downloads は android 版で利用できない。
        remove_el.hidden = false;
        remove_el.addEventListener(
            "click",
            ()=>{
                console.log( "remove file" );
                fileObj.remove();
                dummy_el.remove();
            } );
    }
}

export function isDownloadingNow() {
    const div_el = document.getElementById( "progress" );
    if ( div_el.querySelector( "progress" ) ) {
        return true;
    }
    return false;
}


function analyzeHls( m3u, url ) {
    // 各 url → それぞれのコーデックの詳細マップの作成
    const url2detail = {};
    let srcURL = new URL( url );

    let detail = null;
    m3u.split( "\n" ).forEach( (line)=>{
        if ( detail == null ) {
            if ( line.startsWith( "#EXT-X-STREAM-INF:" ) ) {
                detail = line.replace( "#EXT-X-STREAM-INF:", "" );
            }
        } else {
            let stream_url = joinUrl( srcURL, line );
            url2detail[ stream_url ] = detail;
            detail = null;
        }
    });
    return url2detail;
}

async function download( url, opt ) {
    const resp = await fetch( url, opt );
    if ( !resp.ok ) {
        return null;
    }
    return await resp.arrayBuffer();
}

export async function downloadFromHls( title, url, opt, rewritePrefix ) {
    const arrayBuffer = await download( url, opt );
    if ( !arrayBuffer ) {
        browser.notifications.create({
            "type": "basic",
            "title": "network monitor without devtools",
            "message": `failed to download -- ${title}`
        });
        return;
    }
    let decoder = new TextDecoder();
    const m3u = decoder.decode( arrayBuffer );

    const list_el = document.querySelector( "#stream-list" );
    const selector_el = document.querySelector( ".stream-selector" );

    const url2detail = analyzeHls( m3u, url );

    // どの URL を処理するかユーザ選択
    if ( Object.keys( url2detail ).length != 0 ) {
        while ( list_el.firstChild ) {
            list_el.removeChild( list_el.firstChild );
        }
        Object.keys( url2detail ).forEach( (stream_url)=>{
            let detail = url2detail[ stream_url ];
            let dummy_el = document.createElement( "div" );
            dummy_el.innerHTML = `
<div class="stream-item">
<input type="button" value="download">
<div>${detail}</div>
</div>
`;
            let item_el = dummy_el.querySelector( ".stream-item" );
            item_el.querySelector( "input" ).addEventListener(
                "click",
                async ()=>{
                    selector_el.hidden = true;
                    await downloadFromHlsStream( title, stream_url, opt, rewritePrefix );
                });
            list_el.append( item_el );
        });

        selector_el.querySelector( "input" ).addEventListener(
            "click",
            ()=>{ selector_el.hidden = true; } );
        
        selector_el.hidden = false;
    } else {
        await downloadFromHlsStream( title, url, opt, rewritePrefix );
    }
}


// サーバーから大きいサイズのファイルをチャンクごとにダウンロードする関数
export async function downloadFileInChunks( url, opt )
{
    try {
        const response = await fetch(url, opt);

        // ファイルの合計サイズを取得
        const contentLength = response.headers.get('content-length');
        console.log( "length:", contentLength );
        

        let date_txt = getFilenameWithDate();
        const ext = ".bin";

        const [ fileObj, writer ] = await createTmpFile( date_txt + ext );

        // レスポンスボディのストリームリーダーを取得
        const reader = response.body.getReader();



        let cancelFlag = false;
        let [remove_el, dummy_el, progress_text, progress_el ] =
            addProgress( url, null,
                         ()=>{
                             cancelFlag = true; 
                         } );
        
        let loaded = 0;
        // ストリームからチャンクを読み込む
        while (true) {
            const { done, value } = await reader.read();

            // ストリームの終わりに達した場合
            if (done) {
                break;
            }
            if (cancelFlag) {
                break;
            }

            await writer.write( value );

            // 読み込み済みのサイズを更新
            loaded += value.length;

            progress_text.value = `${loaded}`;
        }
        await writer.close();

        if ( !cancelFlag ) {
            progress_el.value = 100;
            progress_el.max = 100;

            function removeFile() {
                console.log( "remove file" );
                fileObj.remove();
                dummy_el.remove();
            }
            
            const contentType = response.headers.get('content-type');
            let blob = await fileObj.getBlob();
            if ( blob.size < 10 * 1024 * 1024 ) {
                // ダウンロードしたサイズが小さい場合、
                // メモリに読み込んでファイルは直ぐに消す
                let buf = await blob.arrayBuffer();
                saveAs( url2filename( url, contentType ), new Blob( [ buf ] ) );
                removeFile();
            } else {
                saveAs( url2filename( url, contentType ), blob );


                // ブラウザ側のダウンロード完了を検知できないので、手動で削除させる。
                // extension の downloads を使うと検知できるが、
                // downloads は android 版で利用できない。
                remove_el.hidden = false;
                remove_el.addEventListener(
                    "click",
                    ()=>{
                        removeFile();
                    } );
            }
        } else {
            fileObj.remove();
        }
    } catch (error) {
        console.error('ダウンロードエラー:', error);
    }
}
