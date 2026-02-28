function resolveDefaultTimeout() {
    try {
        const v = window?.COOPLYST_CONFIG?.upload_timeout_ms;
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
    } catch (e) { }
    return 300000;
}

export function uploadWithProgress({ url, token, formData, onProgress, onAbortReady, timeoutMs }) {
    if (!timeoutMs) timeoutMs = resolveDefaultTimeout();
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.responseType = 'json';
        xhr.timeout = timeoutMs;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        if (onAbortReady) onAbortReady(() => xhr.abort());

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) {
                onProgress?.(0);
                return;
            }
            const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
            onProgress?.(pct);
        };

        xhr.onload = () => {
            const data = xhr.response ?? parseJsonSafe(xhr.responseText);
            if (xhr.status === 401) {
                window.dispatchEvent(new Event('cooplyst:unauthorized'));
            }
            resolve({
                ok: xhr.status >= 200 && xhr.status < 300,
                status: xhr.status,
                data,
            });
        };

        xhr.onerror = () => reject(new Error('NETWORK_ERROR'));
        xhr.onabort = () => reject(new Error('ABORTED'));
        xhr.ontimeout = () => reject(new Error('UPLOAD_TIMEOUT'));

        xhr.send(formData);
    });
}

export function uploadChunked({ url, token, file, onProgress, onAbortReady, timeoutMs }) {
    if (!timeoutMs) timeoutMs = resolveDefaultTimeout();
    return new Promise(async (resolve, reject) => {
        const chunkSize = 5 * 1024 * 1024; // 5 MB chunks
        const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
        const uploadId = Date.now().toString() + Math.round(Math.random() * 1e9);

        let aborted = false;
        let currentXhr = null;

        if (onAbortReady) {
            onAbortReady(() => {
                aborted = true;
                if (currentXhr) currentXhr.abort();
            });
        }

        let finalData = null;

        for (let i = 0; i < totalChunks; i++) {
            if (aborted) return reject(new Error('ABORTED'));

            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end, file.type);

            const formData = new FormData();
            formData.append('chunkIndex', i.toString());
            formData.append('totalChunks', totalChunks.toString());
            formData.append('uploadId', uploadId);
            formData.append('file', chunk, file.name);

            try {
                const res = await new Promise((resChunk, rejChunk) => {
                    const xhr = new XMLHttpRequest();
                    currentXhr = xhr;
                    xhr.open('POST', url);
                    xhr.responseType = 'json';
                    xhr.timeout = timeoutMs;
                    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const chunkLoaded = event.loaded;
                            const totalLoadedForFile = start + chunkLoaded;
                            const pct = Math.min(100, Math.round((totalLoadedForFile / file.size) * 100));
                            onProgress?.(pct);
                        }
                    };

                    xhr.onload = () => {
                        const data = xhr.response ?? parseJsonSafe(xhr.responseText);
                        if (xhr.status === 401) {
                            window.dispatchEvent(new Event('cooplyst:unauthorized'));
                        }
                        resChunk({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
                    };
                    xhr.onerror = () => rejChunk(new Error('NETWORK_ERROR'));
                    xhr.onabort = () => rejChunk(new Error('ABORTED'));
                    xhr.ontimeout = () => rejChunk(new Error('UPLOAD_TIMEOUT'));

                    if (aborted) {
                        xhr.abort();
                    } else {
                        xhr.send(formData);
                    }
                });

                if (!res.ok) {
                    return resolve(res);
                }

                if (i === totalChunks - 1) {
                    finalData = res;
                }
            } catch (err) {
                return reject(err);
            }
        }
        resolve(finalData);
    });
}

function parseJsonSafe(raw) {
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return { error: 'Invalid server response' };
    }
}
