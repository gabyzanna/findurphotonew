const video = document.getElementById('cameraVideo');
const placeholder = document.getElementById('cameraPlaceholder');
const cameraStatus = document.getElementById('cameraStatus');
const captureButton = document.getElementById('captureButton');
const countdownOverlay = document.getElementById('countdownOverlay');
const cameraHint = document.getElementById('cameraHint');
const capturedList = document.getElementById('capturedList');
const photoCounter = document.getElementById('photoCounter');
const stripCanvas = document.getElementById('stripCanvas');
const ctx = stripCanvas.getContext('2d');
const downloadButton = document.getElementById('downloadButton');
const uploadInput = document.getElementById('uploadInput');
const layoutName = document.getElementById('layoutName');
const cameraSelect = document.getElementById('cameraSelect');

let stream = null;
let photos = [];
let photoCount = 4;
let stripColor = '#fffafc';
let mirrored = true;
let videoDevices = [];
let activeDeviceIndex = 0;
let busy = false;
let cameraStarting = false;
let stripRenderPromise = Promise.resolve();

function setCameraMessage(message) {
    if (cameraStatus) {
        cameraStatus.textContent = message;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    video.srcObject = null;
    video.classList.remove('active');
}

async function getDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
        videoDevices = [];
        updateCameraOptions();
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();

        videoDevices = devices.filter(device =>
            device.kind === 'videoinput'
        );

        updateCameraOptions();
    } catch {
        videoDevices = [];
        updateCameraOptions();
    }
}

function updateCameraOptions() {
    if (!cameraSelect) return;

    const selectedDeviceId =
        stream?.getVideoTracks()[0]?.getSettings().deviceId || '';

    cameraSelect.innerHTML = '';

    if (videoDevices.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Kamera tidak ditemukan';
        cameraSelect.appendChild(option);
        cameraSelect.disabled = true;
        return;
    }

    cameraSelect.disabled = false;

    videoDevices.forEach((device, index) => {
        const option = document.createElement('option');

        option.value = device.deviceId;
        option.textContent = device.label || `Kamera ${index + 1}`;

        cameraSelect.appendChild(option);
    });

    const selectedIndex = videoDevices.findIndex(device =>
        device.deviceId === selectedDeviceId
    );

    if (selectedIndex >= 0) {
        activeDeviceIndex = selectedIndex;
        cameraSelect.value = selectedDeviceId;
    } else if (videoDevices[activeDeviceIndex]) {
        cameraSelect.value = videoDevices[activeDeviceIndex].deviceId;
    }
}

async function startCamera(deviceId = '') {
    if (cameraStarting) return;

    if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage('Kamera tidak didukung');

        placeholder.hidden = false;
        placeholder.querySelector('span').textContent =
            'Buka website melalui localhost atau HTTPS untuk menggunakan kamera.';

        cameraHint.textContent =
            'Browser tidak mendukung akses kamera. Kamu masih bisa mengunggah foto.';

        return;
    }

    cameraStarting = true;
    setCameraMessage('Menghubungkan kamera…');

    if (cameraSelect) {
        cameraSelect.disabled = true;
    }

    try {
        if (stream) {
            stopCamera();
        }

        let constraints = {
            video: deviceId
                ? {
                    deviceId: { exact: deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
                : {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
            audio: false
        };

        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            if (deviceId && error.name !== 'NotAllowedError') {
                constraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                };

                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } else {
                throw error;
            }
        }

        video.srcObject = stream;

        await new Promise((resolve, reject) => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
                resolve();
                return;
            }

            const onLoaded = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                reject(new Error('Video tidak dapat ditampilkan.'));
            };

            const cleanup = () => {
                video.removeEventListener('loadedmetadata', onLoaded);
                video.removeEventListener('error', onError);
            };

            video.addEventListener('loadedmetadata', onLoaded, {
                once: true
            });

            video.addEventListener('error', onError, {
                once: true
            });

            video.play().catch(() => {});
        });

        await video.play();

        video.classList.add('active');
        placeholder.hidden = true;

        video.style.transform = mirrored
            ? 'scaleX(-1)'
            : 'scaleX(1)';

        setCameraMessage('Kamera aktif');

        await getDevices();

        const currentDeviceId =
            stream.getVideoTracks()[0]?.getSettings().deviceId || '';

        const foundIndex = videoDevices.findIndex(device =>
            device.deviceId === currentDeviceId
        );

        if (foundIndex >= 0) {
            activeDeviceIndex = foundIndex;
        } else if (deviceId) {
            activeDeviceIndex = Math.max(
                0,
                videoDevices.findIndex(device =>
                    device.deviceId === deviceId
                )
            );
        }

        updateCameraOptions();

        cameraHint.textContent =
            'Posisikan wajahmu di tengah, lalu tekan tombol biru untuk mulai.';

    } catch (error) {
        stopCamera();

        placeholder.hidden = false;
        setCameraMessage('Kamera belum aktif');

        let message =
            'Kamera tidak dapat dibuka. Coba pilih kamera lain atau unggah foto.';

        if (error.name === 'NotAllowedError' ||
            error.name === 'PermissionDeniedError') {
            message =
                'Akses kamera ditolak. Izinkan kamera dari pengaturan browser.';
        } else if (error.name === 'NotFoundError' ||
                   error.name === 'DevicesNotFoundError') {
            message =
                'Perangkat kamera tidak ditemukan. Periksa sambungan kamera.';
        } else if (error.name === 'NotReadableError' ||
                   error.name === 'TrackStartError') {
            message =
                'Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.';
        } else if (error.name === 'OverconstrainedError') {
            message =
                'Kamera tidak mendukung pengaturan yang diminta. Pilih kamera lain.';
        }

        placeholder.querySelector('span').textContent = message;
        cameraHint.textContent = message;

        await getDevices();

    } finally {
        cameraStarting = false;

        if (cameraSelect) {
            cameraSelect.disabled = videoDevices.length === 0;
        }
    }
}

function drawCoverImage(context, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;

    if (!imageWidth || !imageHeight) return;

    const scale = Math.max(
        width / imageWidth,
        height / imageHeight
    );

    const sourceWidth = width / scale;
    const sourceHeight = height / scale;

    const sourceX = (imageWidth - sourceWidth) / 2;
    const sourceY = (imageHeight - sourceHeight) / 2;

    context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height
    );
}

function renderCaptured() {
    photoCounter.textContent = `${photos.length}/${photoCount}`;
    capturedList.innerHTML = '';

    if (photos.length === 0) {
        capturedList.innerHTML = `
            <div class="empty-captured">
                <span>♡</span>
                <p>Belum ada foto</p>
                <small>Foto kamu akan tampil di sini.</small>
            </div>
        `;
    } else {
        photos.forEach((src, index) => {
            const item = document.createElement('div');
            item.className = 'captured-item';

            const img = document.createElement('img');
            img.src = src;
            img.alt = `Foto ${index + 1}`;

            const number = document.createElement('span');
            number.textContent = `FOTO ${index + 1}`;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.setAttribute(
                'aria-label',
                `Hapus foto ${index + 1}`
            );

            remove.addEventListener('click', () => {
                photos.splice(index, 1);
                renderCaptured();
                renderStrip();
            });

            item.append(img, number, remove);
            capturedList.appendChild(item);
        });
    }

    downloadButton.disabled = photos.length === 0;
}

function renderStrip() {
    const width = 600;
    const pad = 34;
    const gap = 15;
    const captionHeight = 70;

    const photoWidth = width - pad * 2;
    const photoHeight = Math.round(photoWidth * 0.68);

    const height =
        pad +
        photoCount * photoHeight +
        Math.max(0, photoCount - 1) * gap +
        captionHeight +
        pad;

    stripCanvas.width = width;
    stripCanvas.height = height;

    ctx.fillStyle = stripColor;
    ctx.fillRect(0, 0, width, height);

    const imageJobs = [];

    for (let i = 0; i < photoCount; i++) {
        const x = pad;
        const y = pad + i * (photoHeight + gap);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
            x - 2,
            y - 2,
            photoWidth + 4,
            photoHeight + 4
        );

        if (photos[i]) {
            const image = new Image();
            const source = photos[i];

            const job = new Promise(resolve => {
                image.onload = () => {
                    if (photos[i] === source) {
                        drawCoverImage(
                            ctx,
                            image,
                            x,
                            y,
                            photoWidth,
                            photoHeight
                        );
                    }

                    resolve();
                };

                image.onerror = resolve;
                image.src = source;
            });

            imageJobs.push(job);
        } else {
            ctx.fillStyle = '#f4edf3';
            ctx.fillRect(x, y, photoWidth, photoHeight);

            ctx.fillStyle = '#c7b9c9';
            ctx.textAlign = 'center';
            ctx.font = 'bold 42px sans-serif';

            ctx.fillText(
                '♡',
                width / 2,
                y + photoHeight / 2 + 14
            );

            ctx.font = 'bold 17px sans-serif';

            ctx.fillText(
                `FOTO ${i + 1}`,
                width / 2,
                y + photoHeight / 2 + 48
            );
        }
    }

    ctx.fillStyle =
        stripColor.toLowerCase() === '#22202a'
            ? '#ffffff'
            : '#766575';

    ctx.textAlign = 'center';
    ctx.font = 'bold 20px sans-serif';

    ctx.fillText(
        'FindurPhoto  ♥  2026',
        width / 2,
        height - 31
    );

    stripRenderPromise = Promise.all(imageJobs);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdownAndCapture() {
    if (busy) return;

    if (!stream || !video.videoWidth) {
        cameraHint.textContent =
            'Aktifkan kamera terlebih dahulu atau unggah foto.';
        return;
    }

    if (photos.length >= photoCount) {
        cameraHint.textContent =
            'Jumlah foto sudah terpenuhi. Hapus foto atau pilih layout lain.';
        return;
    }

    busy = true;
    captureButton.disabled = true;

    try {
        for (let number = 3; number >= 1; number--) {
            countdownOverlay.hidden = false;
            countdownOverlay.textContent = number;
            await wait(700);
        }

        countdownOverlay.hidden = true;

        if (!stream || !video.videoWidth) {
            throw new Error('Kamera terputus.');
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d');

        if (mirrored) {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        photos.push(canvas.toDataURL('image/jpeg', 0.92));

        renderCaptured();
        renderStrip();

        cameraHint.textContent = photos.length >= photoCount
            ? 'Semua slot terisi! Kamu bisa download hasilnya atau ubah layout.'
            : `Foto ${photos.length} berhasil diambil. Siap untuk pose berikutnya?`;

    } catch {
        countdownOverlay.hidden = true;
        cameraHint.textContent =
            'Foto gagal diambil. Pastikan kamera masih aktif, lalu coba lagi.';
    } finally {
        busy = false;
        captureButton.disabled = false;
    }
}

document.getElementById('enableCamera').addEventListener('click', () => {
    startCamera(cameraSelect?.value || '');
});

if (cameraSelect) {
    cameraSelect.addEventListener('change', async () => {
        const selectedDeviceId = cameraSelect.value;

        if (selectedDeviceId) {
            await startCamera(selectedDeviceId);
        }
    });
}

captureButton.addEventListener('click', countdownAndCapture);

document.getElementById('switchCamera').addEventListener('click', async () => {
    await getDevices();

    if (!videoDevices.length) {
        cameraHint.textContent =
            'Tidak ada perangkat kamera yang ditemukan. Aktifkan kamera terlebih dahulu.';
        return;
    }

    if (videoDevices.length === 1) {
        cameraHint.textContent =
            'Hanya satu kamera terdeteksi. Sambungkan kamera lain jika ingin berganti.';
        return;
    }

    activeDeviceIndex =
        (activeDeviceIndex + 1) % videoDevices.length;

    const nextDevice = videoDevices[activeDeviceIndex];

    if (cameraSelect) {
        cameraSelect.value = nextDevice.deviceId;
    }

    await startCamera(nextDevice.deviceId);
});

document.getElementById('mirrorButton').addEventListener('click', () => {
    mirrored = !mirrored;

    video.style.transform = mirrored
        ? 'scaleX(-1)'
        : 'scaleX(1)';

    document.getElementById('mirrorButton').style.color =
        mirrored ? 'var(--pink)' : '#7d7187';
});

document.getElementById('retakeButton').addEventListener('click', () => {
    photos = [];

    renderCaptured();
    renderStrip();

    cameraHint.textContent =
        'Sesi dikosongkan. Kamu bisa mulai berfoto lagi.';
});

document.getElementById('clearPhotos').addEventListener('click', () => {
    photos = [];

    renderCaptured();
    renderStrip();

    cameraHint.textContent = 'Semua foto sudah dihapus.';
});

document.getElementById('resetAll').addEventListener('click', () => {
    photos = [];
    photoCount = 4;
    stripColor = '#fffafc';
    mirrored = true;

    document.querySelectorAll('.layout-option').forEach(button => {
        button.classList.toggle(
            'active',
            button.dataset.count === '4'
        );
    });

    document.querySelectorAll('.color-choice').forEach(button => {
        button.classList.toggle(
            'active',
            button.dataset.color === stripColor
        );
    });

    layoutName.textContent = 'Classic Strip';
    video.style.transform = 'scaleX(-1)';

    renderCaptured();
    renderStrip();

    cameraHint.textContent =
        'Studio sudah diatur ulang. Silakan mulai berfoto.';
});

document.querySelectorAll('.layout-option').forEach(button => {
    button.addEventListener('click', () => {
        photoCount = Number(button.dataset.count);

        document.querySelectorAll('.layout-option').forEach(item => {
            item.classList.toggle('active', item === button);
        });

        layoutName.textContent = ({
            2: 'Double Shot',
            3: 'Mini Strip',
            4: 'Classic Strip',
            6: 'Long Strip'
        })[photoCount] || 'Photo Strip';

        photos = photos.slice(0, photoCount);

        renderCaptured();
        renderStrip();
    });
});

document.querySelectorAll('.color-choice').forEach(button => {
    button.addEventListener('click', () => {
        stripColor = button.dataset.color;

        document.querySelectorAll('.color-choice').forEach(item => {
            item.classList.toggle('active', item === button);
        });

        renderStrip();
    });
});

uploadInput.addEventListener('change', async event => {
    const files = [...event.target.files].filter(file =>
        file.type.startsWith('image/')
    );

    for (const file of files) {
        if (photos.length >= photoCount) break;

        try {
            const imageData = await new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;

                reader.readAsDataURL(file);
            });

            photos.push(imageData);
        } catch {
            cameraHint.textContent =
                `Foto ${file.name} gagal dibaca. Coba pilih gambar lain.`;
        }
    }

    renderCaptured();
    renderStrip();

    cameraHint.textContent =
        `Foto berhasil ditambahkan. Total ${photos.length} dari ${photoCount} foto.`;

    uploadInput.value = '';
});

downloadButton.addEventListener('click', async () => {
    if (!photos.length) return;

    downloadButton.disabled = true;

    try {
        await stripRenderPromise;

        const link = document.createElement('a');
        link.download = 'findurphoto-strip.jpg';
        link.href = stripCanvas.toDataURL('image/jpeg', 0.95);

        document.body.appendChild(link);
        link.click();
        link.remove();

    } catch {
        cameraHint.textContent =
            'Gagal mengunduh foto. Silakan coba kembali.';
    } finally {
        downloadButton.disabled = photos.length === 0;
    }
});

if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
}

renderCaptured();
renderStrip();

if (cameraSelect) {
    cameraSelect.innerHTML = '<option value="">Aktifkan kamera terlebih dahulu</option>';
    cameraSelect.disabled = true;
}

if (!navigator.mediaDevices?.getUserMedia) {
    setCameraMessage('Gunakan localhost atau HTTPS');

    placeholder.hidden = false;
    placeholder.querySelector('span').textContent =
        'Buka website melalui localhost atau HTTPS untuk menggunakan kamera.';
} else {
    setCameraMessage('Kamera belum aktif');
}
