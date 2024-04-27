"use strict";

export const kind2ContentTypeSet = {
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
        "application/vnd.yt-ump",
    ] ),
    streaming: new Set( [
        "application/vnd.apple.mpegurl",
        "application/x-mpegurl",
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

export const contentType2ext = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/webp": "webp",
    "image/vnd.microsoft.icon": "ico",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogg",
    "video/mov": "mov",
    "video/avi": "avi",
    "video/flv": "flv",
    "video/wmv": "wmv",
    "video/3gp": "3gp",
    "video/mkv": "mkv",
    "video/mp2t": "mp2t",
    "application/vnd.apple.mpegurl": "m3u8",
    "application/x-mpegurl": "m3u8",
    "text/html": "html",
    "text/css": "css",
    "text/javascript": "js",
    "application/json": "json",
    "application/xml": "xml",
    "application/json+protobuf": "json",
}

export function normlizeContentType( contentType ) {
    if ( contentType && contentType != "" ) {
        contentType = contentType.toLowerCase();
        let tokens = contentType.split( ";" );
        if ( tokens.length > 1 ) {
            contentType = tokens[ 0 ];
        }
    }
    return contentType;
}
