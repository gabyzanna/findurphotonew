(() => {
    "use strict";

    const $ = (selector, root = document) =>
        root.querySelector(selector);

    const $$ = (selector, root = document) =>
        [...root.querySelectorAll(selector)];

    const video = $("#cameraVideo");
    const placeholder = $("#cameraPlaceholder");
    const cameraStatus = $("#cameraStatus");
    const captureButton = $("#captureButton");
    const countdownOverlay = $("#countdownOverlay");
    const cameraHint = $("#cameraHint");
    const capturedList = $("#capturedList");
    const photoCounter = $("#photoCounter");
    const stripCanvas = $("#stripCanvas");
    const ctx = stripCanvas.getContext("2d");
    const downloadButton = $("#downloadButton");
    const uploadInput = $("#uploadInput");
    const layoutName = $("#layoutName");
    const cameraSelect = $("#cameraSelect");
    const templateGallery = $("#templateGallery");

    const templateInfo = {
        plain: [
            "Polos",
            "Menggunakan warna strip pilihanmu."
        ],
        classic: [
            "Classic",
            "Bingkai minimalis dengan tampilan elegan."
        ],
        pink: [
            "Pastel Pink",
            "Aksen pink lembut dengan dekorasi hati."
        ],
        lilac: [
            "Lilac",
            "Nuansa ungu lembut dengan dekorasi kilau."
        ],
        mint: [
            "Mint",
            "Warna mint segar dengan aksen minimalis."
        ],
        dark: [
            "Dark",
            "Latar gelap dengan bingkai elegan."
        ],
        floral: [
            "Floral",
            "Dekorasi bunga pada sudut strip."
        ]
    };

    let stream = null;
    let photos = [];
    let photoCount = 4;
    let stripColor = "#fffafc";
    let selectedTemplate = "plain";
    let mirrored = true;
    let videoDevices = [];
    let activeDeviceIndex = 0;
    let busy = false;
    let cameraStarting = false;
    let renderVersion = 0;
    let renderPromise = Promise.resolve();

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
        video.classList.remove("active");
    }

    async function getDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) {
            videoDevices = [];
            updateCameraOptions();
            return;
        }

        try {
            const devices =
                await navigator.mediaDevices.enumerateDevices();

            videoDevices = devices.filter(
                device => device.kind === "videoinput"
            );
        } catch {
            videoDevices = [];
        }

        updateCameraOptions();
    }

    function updateCameraOptions() {
        if (!cameraSelect) return;

        const selectedId =
            stream?.getVideoTracks()[0]?.getSettings().deviceId || "";

        cameraSelect.innerHTML = "";

        if (!videoDevices.length) {
            cameraSelect.add(
                new Option("Kamera tidak ditemukan", "")
            );

            cameraSelect.disabled = true;
            return;
        }

        videoDevices.forEach((device, index) => {
            cameraSelect.add(
                new Option(
                    device.label || `Kamera ${index + 1}`,
                    device.deviceId
                )
            );
        });

        const index = videoDevices.findIndex(
            device => device.deviceId === selectedId
        );

        if (index >= 0) {
            activeDeviceIndex = index;
            cameraSelect.value = selectedId;
        } else if (videoDevices[activeDeviceIndex]) {
            cameraSelect.value =
                videoDevices[activeDeviceIndex].deviceId;
        }
    }

    async function startCamera(deviceId = "") {
        if (cameraStarting) return;

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraMessage("Gunakan localhost atau HTTPS");

            placeholder.hidden = false;

            const hint = $("span", placeholder);

            if (hint) {
                hint.textContent =
                    "Buka website melalui localhost atau HTTPS untuk menggunakan kamera.";
            }

            cameraHint.textContent =
                "Browser tidak mendukung akses kamera. Kamu masih bisa mengunggah foto.";

            return;
        }

        cameraStarting = true;
        setCameraMessage("Menghubungkan kamera…");

        if (cameraSelect) {
            cameraSelect.disabled = true;
        }

        try {
            stopCamera();

            let constraints = {
                video: deviceId
                    ? {
                        deviceId: { exact: deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                    : {
                        facingMode: "user",
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                audio: false
            };

            try {
                stream =
                    await navigator.mediaDevices.getUserMedia(
                        constraints
                    );
            } catch (error) {
                if (
                    !deviceId ||
                    [
                        "NotAllowedError",
                        "PermissionDeniedError"
                    ].includes(error.name)
                ) {
                    throw error;
                }

                constraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                };

                stream =
                    await navigator.mediaDevices.getUserMedia(
                        constraints
                    );
            }

            video.srcObject = stream;

            await new Promise((resolve, reject) => {
                if (
                    video.readyState >= 2 &&
                    video.videoWidth > 0
                ) {
                    resolve();
                    return;
                }

                const loaded = () => {
                    cleanup();
                    resolve();
                };

                const failed = () => {
                    cleanup();
                    reject(
                        new Error("Video tidak dapat ditampilkan.")
                    );
                };

                const cleanup = () => {
                    video.removeEventListener(
                        "loadedmetadata",
                        loaded
                    );

                    video.removeEventListener(
                        "error",
                        failed
                    );
                };

                video.addEventListener(
                    "loadedmetadata",
                    loaded,
                    { once: true }
                );

                video.addEventListener(
                    "error",
                    failed,
                    { once: true }
                );

                video.play().catch(() => {});
            });

            await video.play();

            video.classList.add("active");
            placeholder.hidden = true;

            video.style.transform = mirrored
                ? "scaleX(-1)"
                : "scaleX(1)";

            setCameraMessage("Kamera aktif");

            await getDevices();

            const currentId =
                stream.getVideoTracks()[0]
                    ?.getSettings().deviceId || "";

            const currentIndex = videoDevices.findIndex(
                device => device.deviceId === currentId
            );

            if (currentIndex >= 0) {
                activeDeviceIndex = currentIndex;
            }

            updateCameraOptions();

            cameraHint.textContent =
                "Posisikan wajahmu di tengah, lalu tekan tombol untuk mulai mengambil foto.";

        } catch (error) {
            stopCamera();

            placeholder.hidden = false;
            setCameraMessage("Kamera belum aktif");

            let message =
                "Kamera tidak dapat dibuka. Coba pilih kamera lain atau unggah foto.";

            if (
                [
                    "NotAllowedError",
                    "PermissionDeniedError"
                ].includes(error.name)
            ) {
                message =
                    "Akses kamera ditolak. Izinkan kamera dari pengaturan browser.";
            } else if (
                [
                    "NotFoundError",
                    "DevicesNotFoundError"
                ].includes(error.name)
            ) {
                message =
                    "Perangkat kamera tidak ditemukan. Periksa sambungan kamera.";
            } else if (
                [
                    "NotReadableError",
                    "TrackStartError"
                ].includes(error.name)
            ) {
                message =
                    "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
            }

            const hint = $("span", placeholder);

            if (hint) {
                hint.textContent = message;
            }

            cameraHint.textContent = message;

            await getDevices();

        } finally {
            cameraStarting = false;

            if (cameraSelect) {
                cameraSelect.disabled =
                    videoDevices.length === 0;
            }
        }
    }

    function roundedRect(
        context,
        x,
        y,
        width,
        height,
        radius
    ) {
        const r = Math.min(
            radius,
            width / 2,
            height / 2
        );

        context.beginPath();
        context.moveTo(x + r, y);

        context.arcTo(
            x + width,
            y,
            x + width,
            y + height,
            r
        );

        context.arcTo(
            x + width,
            y + height,
            x,
            y + height,
            r
        );

        context.arcTo(
            x,
            y + height,
            x,
            y,
            r
        );

        context.arcTo(
            x,
            y,
            x + width,
            y,
            r
        );

        context.closePath();
    }

    function drawCoverImage(
        context,
        image,
        x,
        y,
        width,
        height
    ) {
        const iw = image.naturalWidth || image.width;
        const ih = image.naturalHeight || image.height;

        if (!iw || !ih) return;

        const scale = Math.max(
            width / iw,
            height / ih
        );

        const sw = width / scale;
        const sh = height / scale;
        const sx = (iw - sw) / 2;
        const sy = (ih - sh) / 2;

        context.drawImage(
            image,
            sx,
            sy,
            sw,
            sh,
            x,
            y,
            width,
            height
        );
    }

    function drawHeart(context, x, y, size, color) {
        context.save();

        context.translate(x, y);
        context.scale(size / 30, size / 30);

        context.beginPath();
        context.moveTo(0, 10);

        context.bezierCurveTo(
            -25, -5,
            -12, -18,
            0, -7
        );

        context.bezierCurveTo(
            12, -18,
            25, -5,
            0, 10
        );

        context.fillStyle = color;
        context.fill();
        context.restore();
    }

    function drawFlower(context, x, y, size, color) {
        context.save();

        for (let i = 0; i < 5; i++) {
            context.beginPath();

            context.ellipse(
                x,
                y - size * 0.35,
                size * 0.18,
                size * 0.32,
                0,
                0,
                Math.PI * 2
            );

            context.fillStyle = color;
            context.fill();

            context.translate(x, y);
            context.rotate(Math.PI * 2 / 5);
            context.translate(-x, -y);
        }

        context.beginPath();

        context.arc(
            x,
            y,
            size * 0.14,
            0,
            Math.PI * 2
        );

        context.fillStyle = "#e8b64b";
        context.fill();

        context.restore();
    }

    function drawDecoration(width, height, footerY) {
        const palettes = {
            plain: {
                text: stripColor.toLowerCase() === "#22202a"
                    ? "#ffffff"
                    : "#766575"
            },
            classic: {
                border: "#ffffff",
                accent: "#b8a5b7",
                text: "#766575"
            },
            pink: {
                border: "#fff4f8",
                accent: "#e76d9d",
                text: "#b34d7b"
            },
            lilac: {
                border: "#f8f4ff",
                accent: "#8b72c9",
                text: "#6e5a9c"
            },
            mint: {
                border: "#f4fff7",
                accent: "#5caa7c",
                text: "#477e5c"
            },
            dark: {
                border: "#494451",
                accent: "#f5d9a6",
                text: "#ffffff"
            },
            floral: {
                border: "#fff7fa",
                accent: "#d779a0",
                text: "#a45175"
            }
        };

        const p = palettes[selectedTemplate] || palettes.plain;

        if (selectedTemplate !== "plain") {
            ctx.save();

            ctx.strokeStyle = p.border;
            ctx.lineWidth = 5;

            ctx.strokeRect(
                13,
                13,
                width - 26,
                height - 26
            );

            ctx.strokeStyle = p.accent;
            ctx.lineWidth = 2;

            ctx.strokeRect(
                23,
                23,
                width - 46,
                height - 46
            );

            ctx.restore();
        }

        if (selectedTemplate === "pink") {
            drawHeart(ctx, 33, 34, 18, "#ef8db3");
            drawHeart(ctx, width - 33, 34, 18, "#ef8db3");
            drawHeart(ctx, 33, footerY - 25, 15, "#ef8db3");
            drawHeart(ctx, width - 33, footerY - 25, 15, "#ef8db3");

        } else if (selectedTemplate === "lilac") {
            [
                [34, 34],
                [width - 34, 34],
                [34, footerY - 25],
                [width - 34, footerY - 25]
            ].forEach(([x, y]) => {
                ctx.fillStyle = "#9a83d5";
                ctx.font = "bold 25px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("✦", x, y);
            });

        } else if (selectedTemplate === "mint") {
            ctx.fillStyle = "#70b98b";

            [
                [35, 35],
                [width - 35, 35],
                [35, footerY - 22],
                [width - 35, footerY - 22]
            ].forEach(([x, y]) => {
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fill();
            });

        } else if (selectedTemplate === "floral") {
            drawFlower(ctx, 33, 35, 20, "#eaa0bd");
            drawFlower(ctx, width - 33, 35, 20, "#eaa0bd");
            drawFlower(ctx, 33, footerY - 24, 18, "#eaa0bd");
            drawFlower(ctx, width - 33, footerY - 24, 18, "#eaa0bd");

        } else if (selectedTemplate === "classic") {
            ctx.fillStyle = "#b8a5b7";
            ctx.beginPath();
            ctx.arc(
                width / 2,
                footerY - 24,
                4,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }

        ctx.save();

        ctx.fillStyle = p.text;
        ctx.textAlign = "center";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText("FindurPhoto", width / 2, footerY);

        ctx.font = "14px sans-serif";
        ctx.fillText(
            "MAKE MEMORIES ♥",
            width / 2,
            footerY + 25
        );

        ctx.restore();
    }

    async function renderStrip() {
        const version = ++renderVersion;
        const width = 600;
        const pad = selectedTemplate === "plain" ? 34 : 46;
        const gap = photoCount >= 6 ? 13 : 17;
        const footerHeight = 86;
        const photoWidth = width - pad * 2;
        const photoHeight = Math.round(photoWidth * 0.68);

        const height =
            pad +
            photoCount * photoHeight +
            (photoCount - 1) * gap +
            footerHeight +
            pad;

        stripCanvas.width = width;
        stripCanvas.height = height;

        ctx.fillStyle = selectedTemplate === "dark"
            ? "#22202a"
            : stripColor;

        ctx.fillRect(0, 0, width, height);

        const jobs = [];

        for (let i = 0; i < photoCount; i++) {
            const x = pad;
            const y = pad + i * (photoHeight + gap);
            const src = photos[i];

            if (src) {
                const job = new Promise(resolve => {
                    const image = new Image();

                    image.onload = () => {
                        if (version === renderVersion) {
                            ctx.save();

                            roundedRect(
                                ctx,
                                x,
                                y,
                                photoWidth,
                                photoHeight,
                                selectedTemplate === "classic" ? 0 : 8
                            );

                            ctx.clip();

                            drawCoverImage(
                                ctx,
                                image,
                                x,
                                y,
                                photoWidth,
                                photoHeight
                            );

                            ctx.restore();

                            if (selectedTemplate !== "plain") {
                                ctx.strokeStyle =
                                    selectedTemplate === "dark"
                                        ? "#f5d9a6"
                                        : "#ffffff";

                                ctx.lineWidth =
                                    selectedTemplate === "classic"
                                        ? 5
                                        : 3;

                                roundedRect(
                                    ctx,
                                    x,
                                    y,
                                    photoWidth,
                                    photoHeight,
                                    8
                                );

                                ctx.stroke();
                            }
                        }

                        resolve();
                    };

                    image.onerror = resolve;
                    image.src = src;
                });

                jobs.push(job);

            } else {
                ctx.fillStyle = selectedTemplate === "dark"
                    ? "#393541"
                    : "#f0e8ef";

                roundedRect(
                    ctx,
                    x,
                    y,
                    photoWidth,
                    photoHeight,
                    8
                );

                ctx.fill();

                ctx.fillStyle = selectedTemplate === "dark"
                    ? "#c8bacd"
                    : "#c7b9c9";

                ctx.textAlign = "center";
                ctx.font = "bold 42px sans-serif";

                ctx.fillText(
                    "♡",
                    width / 2,
                    y + photoHeight / 2 + 8
                );

                ctx.font = "bold 16px sans-serif";

                ctx.fillText(
                    `FOTO ${i + 1}`,
                    width / 2,
                    y + photoHeight / 2 + 38
                );
            }
        }

        renderPromise = Promise.all(jobs);
        await renderPromise;

        if (version !== renderVersion) return;

        const footerY = height - pad - 44;

        drawDecoration(width, height, footerY);

        downloadButton.disabled = photos.length === 0;
    }

    function renderCaptured() {
        photoCounter.textContent =
            `${photos.length}/${photoCount}`;

        capturedList.innerHTML = "";

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
                const item = document.createElement("div");
                item.className = "captured-item";

                const image = document.createElement("img");
                image.src = src;
                image.alt = `Foto ${index + 1}`;

                const number = document.createElement("span");
                number.textContent = `FOTO ${index + 1}`;

                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "×";
                remove.setAttribute(
                    "aria-label",
                    `Hapus foto ${index + 1}`
                );

                remove.addEventListener("click", () => {
                    photos.splice(index, 1);
                    renderCaptured();
                    renderStrip();
                });

                item.append(image, number, remove);
                capturedList.appendChild(item);
            });
        }

        downloadButton.disabled = photos.length === 0;
    }

    function refreshTemplateInfo() {
        const info =
            templateInfo[selectedTemplate] || templateInfo.plain;

        const name = $("#selectedTemplateName");
        const description = $("#selectedTemplateDescription");

        if (name) name.textContent = info[0];
        if (description) description.textContent = info[1];

        $$(".template-card").forEach(button => {
            const active =
                button.dataset.template === selectedTemplate;

            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function setPhotoCount(count) {
        photoCount = count;
        photos = photos.slice(0, photoCount);

        $$(".layout-option").forEach(button => {
            button.classList.toggle(
                "active",
                Number(button.dataset.count) === photoCount
            );
        });

        const names = {
            2: "Double Shot",
            3: "Mini Strip",
            4: "Classic Strip",
            6: "Long Strip"
        };

        layoutName.textContent = names[photoCount] || "Photo Strip";

        renderCaptured();
        renderStrip();
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function countdownAndCapture() {
        if (busy) return;

        if (!stream || !video.videoWidth) {
            cameraHint.textContent =
                "Aktifkan kamera terlebih dahulu atau unggah foto.";
            return;
        }

        if (photos.length >= photoCount) {
            cameraHint.textContent =
                "Jumlah foto sudah terpenuhi. Hapus foto atau pilih layout lain.";
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
                throw new Error("Kamera terputus.");
            }

            const canvas = document.createElement("canvas");

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d");

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

            photos.push(canvas.toDataURL("image/jpeg", 0.92));

            renderCaptured();
            renderStrip();

            cameraHint.textContent = photos.length >= photoCount
                ? "Semua slot terisi! Kamu bisa download hasilnya atau ubah layout."
                : `Foto ${photos.length} berhasil diambil. Siap untuk pose berikutnya?`;

        } catch {
            countdownOverlay.hidden = true;

            cameraHint.textContent =
                "Foto gagal diambil. Pastikan kamera masih aktif, lalu coba lagi.";

        } finally {
            busy = false;
            captureButton.disabled = false;
        }
    }

    $("#enableCamera").addEventListener("click", () => {
        startCamera(cameraSelect.value || "");
    });

    cameraSelect.addEventListener("change", () => {
        if (cameraSelect.value) {
            startCamera(cameraSelect.value);
        }
    });

    captureButton.addEventListener(
        "click",
        countdownAndCapture
    );

    $("#switchCamera").addEventListener("click", async () => {
        await getDevices();

        if (!videoDevices.length) {
            cameraHint.textContent =
                "Tidak ada perangkat kamera yang ditemukan.";
            return;
        }

        if (videoDevices.length === 1) {
            cameraHint.textContent =
                "Hanya satu kamera terdeteksi.";
            return;
        }

        activeDeviceIndex =
            (activeDeviceIndex + 1) % videoDevices.length;

        await startCamera(
            videoDevices[activeDeviceIndex].deviceId
        );
    });

    $("#mirrorButton").addEventListener("click", () => {
        mirrored = !mirrored;

        video.style.transform = mirrored
            ? "scaleX(-1)"
            : "scaleX(1)";

        $("#mirrorButton").style.color = mirrored
            ? "var(--pink)"
            : "#7d7187";
    });

    $("#retakeButton").addEventListener("click", () => {
        photos = [];

        renderCaptured();
        renderStrip();

        cameraHint.textContent =
            "Sesi dikosongkan. Kamu bisa mulai berfoto lagi.";
    });

    $("#clearPhotos").addEventListener("click", () => {
        photos = [];

        renderCaptured();
        renderStrip();

        cameraHint.textContent = "Semua foto sudah dihapus.";
    });

    $("#resetAll").addEventListener("click", () => {
        photos = [];
        stripColor = "#fffafc";
        selectedTemplate = "plain";
        mirrored = true;

        video.style.transform = "scaleX(-1)";

        $$(".color-choice").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.color === stripColor
            );
        });

        setPhotoCount(4);
        refreshTemplateInfo();

        cameraHint.textContent =
            "Studio sudah diatur ulang. Silakan mulai berfoto.";

        renderStrip();
    });

    $$(".layout-option").forEach(button => {
        button.addEventListener("click", () => {
            setPhotoCount(Number(button.dataset.count));
        });
    });

    $$(".color-choice").forEach(button => {
        button.addEventListener("click", () => {
            stripColor = button.dataset.color;

            $$(".color-choice").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            renderStrip();
        });
    });

    if (templateGallery) {
        templateGallery.addEventListener("click", event => {
            const button = event.target.closest(".template-card");

            if (!button) return;

            selectedTemplate = button.dataset.template;

            if (!templateInfo[selectedTemplate]) {
                selectedTemplate = "plain";
            }

            refreshTemplateInfo();
            renderStrip();
        });
    }

    uploadInput.addEventListener("change", async event => {
        const files = [...event.target.files].filter(file =>
            file.type.startsWith("image/")
        );

        for (const file of files) {
            if (photos.length >= photoCount) break;

            try {
                const data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();

                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;

                    reader.readAsDataURL(file);
                });

                photos.push(data);

            } catch {
                cameraHint.textContent =
                    `Foto ${file.name} gagal dibaca. Coba gambar lain.`;
            }
        }

        renderCaptured();
        renderStrip();

        cameraHint.textContent =
            `Foto ditambahkan. Total ${photos.length} dari ${photoCount} foto.`;

        uploadInput.value = "";
    });

    downloadButton.addEventListener("click", async () => {
        if (!photos.length) return;

        downloadButton.disabled = true;

        try {
            await renderStrip();
            await renderPromise;

            const link = document.createElement("a");

            link.download =
                `FindurPhoto-${selectedTemplate}-${photoCount}-foto.png`;

            link.href = stripCanvas.toDataURL("image/png");

            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch {
            cameraHint.textContent =
                "Gagal mengunduh foto. Silakan coba kembali.";

        } finally {
            downloadButton.disabled = photos.length === 0;
        }
    });

    if (navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener(
            "devicechange",
            getDevices
        );
    }

    renderCaptured();
    refreshTemplateInfo();
    renderStrip();

    cameraSelect.innerHTML =
        '<option value="">Aktifkan kamera terlebih dahulu</option>';

    cameraSelect.disabled = true;

    if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("Gunakan localhost atau HTTPS");

        placeholder.hidden = false;

        const hint = $("span", placeholder);

        if (hint) {
            hint.textContent =
                "Buka website melalui localhost atau HTTPS untuk menggunakan kamera.";
        }
    } else {
        setCameraMessage("Kamera belum aktif");
    }
})();