"use strict";

export async function removeDir( dirname ) {
    try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry( dirname, { recursive: true } );
    } catch ( err ) {
        console.log( err );
    }
}

export async function createDir( dirname ) {
    const root = await navigator.storage.getDirectory();
    const dirHandle = await root.getDirectoryHandle( dirname, { create: true } );
    return new DirObj( dirHandle );
}

export class DirObj {
    constructor( dirHandle ) {
        this.dirHandle = dirHandle;
    }
    async createFile( filename ){
        let fileHandle =
            await this.dirHandle.getFileHandle( filename, { create: true });
        return new FileObj( fileHandle );
    }

    async lsdir( name ) {
        for await (const [key, value] of this.dirHandle.entries()) {
            console.log( name, key, value );
        }
    }
}

export class FileObj {
    constructor( fileHandle ) {
        this.fileHandle = fileHandle;
    }
    
    async getWritable() {
        return await this.fileHandle.createWritable();
    }
    async getBlob() {
        return await this.fileHandle.getFile();
    }
}
