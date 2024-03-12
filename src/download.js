import * as FS from "./fs.js";

function num2Str( fig, num ) {
    return num.toString(10).padStart( fig, '0' );
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

async function retryDownload( url, retryCount ) {
    let response;
    let count = 0;

    while ( count <= retryCount ) {
        try {
            response = await fetch(url);
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
    throw new Error( "retry over -- " + url );
}


async function downloadAndJoin( urlList, progressFunc ) {
    let date_txt;    

    {
        let now = new Date();
        date_txt = `${now.getFullYear()}-` +
            `${num2Str( 2, now.getMonth() + 1 )}-` +
            `${num2Str( 2, now.getDate() )}_` +
            `${num2Str( 2, now.getHours() )}-` +
            `${num2Str( 2, now.getMinutes() )}-` +
            `${num2Str( 2, now.getSeconds() )}.` +
            `${num2Str( 3, now.getMilliseconds() )}`;
    }
    console.log( date_txt );
    


    function saveAs( name, blob ) {
        let workUrl = URL.createObjectURL( blob );

        const anchor = document.createElement("a");
        anchor.href = workUrl;
        anchor.download = name;
        anchor.click();
        
        //URL.revokeObjectURL( workUrl );
    }

    const ext = ".bin";


    const dirObj = await FS.createDir( "downloads" );
    const fileObj = await dirObj.createFile( `${date_txt}${ext}` );
    const writer = await fileObj.getWritable();


    let cancelFlag = false;

    for ( let index = 0; index < urlList.length; index++ ) {
        const partUrl = urlList[ index ];

        let resp = await retryDownload( partUrl, 3 );
        let blob = await resp.blob();
        await writer.write( blob );

        
        if ( !progressFunc( index ) ) {
            cancelFlag = true;
            break;
        }
    }
    await writer.close();
    
    if ( !cancelFlag ) {
        let blob = await fileObj.getBlob();
        saveAs( `${date_txt}${ext}`, blob );
    }
}

async function downloadFromHlsStream( title, url ) {
    console.log( "downloadFromHlsStream", title, url );

    let srcURL = new URL( url );

    let resp = await fetch( url );
    let m3u = await resp.text();

    const urlList = [];
    let hasHeader = false;
    m3u.split( "\n" ).forEach( (line)=>{
        if ( hasHeader ) {
            urlList.push( joinUrl( srcURL, line ) );
            hasHeader = false;
        } else if ( line.startsWith( "#EXTINF:" ) ) {
            hasHeader = true;
        }
    });

    const div_el = document.getElementById( "progress" );

    const dummy_el = document.createElement( "div" );
    div_el.append( dummy_el );
    dummy_el.innerHTML = `
<input type="button" value="cancel" >
<div>${title}</div>
<progress style="width:100%;" max="${urlList.length}" value="0">
`;

    let cancelFlag = false;
    dummy_el.querySelector( "input" ).addEventListener(
        "click",
        ()=>{ cancelFlag = true; } );

    await downloadAndJoin(
        urlList,
        (progress)=>{
            dummy_el.querySelector( "progress" ).value = progress;
            return !cancelFlag;
        });

    dummy_el.remove();
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

export async function downloadFromHls( title, url ) {
    const resp = await fetch( url );
    const m3u = await resp.text();

    const list_el = document.querySelector( "#stream-list" );
    const selector_el = document.querySelector( ".stream-selector" );

    const url2detail = analyzeHls( m3u, url );

    // どの URL を処理するかユーザ選択
    if ( Object.keys( url2detail ).length != 0 ) {
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
                    await downloadFromHlsStream( title, stream_url );
                });
            list_el.append( item_el );
        });

        selector_el.querySelector( "input" ).addEventListener(
            "click",
            ()=>{ selector_el.hidden = true; } );
        
        selector_el.hidden = false;
    } else {
        await downloadFromHlsStream( title, url );
    }
}
