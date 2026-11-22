/* PromosIA: editor de flyers 100% del lado del cliente. */
(() => {
  "use strict";

  const palettes = [
    { name: "Gastronomía / Fuego", colors: ["#D90429", "#FF7B00", "#FFF8F0", "#1B1B1E"] },
    { name: "Estética / Glam", colors: ["#F4ACB7", "#D4A373", "#FFFDF9", "#4A192C"] },
    { name: "Tech / Moderno", colors: ["#0066FF", "#8B5CF6", "#00E5FF", "#0F172A"] },
    { name: "Natural / Eco", colors: ["#2D6A4F", "#95D5B2", "#F8F5F0", "#1B4332"] },
    { name: "Oferta Impacto", colors: ["#FFD60A", "#111111", "#FFFFFF", "#333533"] },
    { name: "Dulce / Pastelería", colors: ["#FF758F", "#FFCCD5", "#FFF0F3", "#590D22"] }
  ];
  const fontPairs = {
    urban: { title: "Anton", body: "Montserrat" },
    editorial: { title: "Playfair Display", body: "Lato" },
    friendly: { title: "Fredoka", body: "Nunito" },
    modern: { title: "Space Grotesk", body: "Inter" }
  };
  const sizes = { story: [1080, 1920], square: [1080, 1080] };
  const state = {
    format: "story",
    paletteIndex: 2,
    backgroundStyle: "gradient",
    backgroundColor: "#0066ff",
    backgroundImage: null,
    uploadedBackgroundUrl: null,
    pendingUploadUrl: null,
    generatedPrompt: null,
    backgroundModeChosen: false,
    activeGeneration: null,
    fontPair: "urban",
    texts: {
      title: { value: "2x1 EN BURGERS", size: 112, color: "#FFF8F0", align: "center", x: 540, y: 765 },
      subtitle: { value: "Solo por hoy · Envío sin cargo", size: 44, color: "#FFF8F0", align: "center", x: 540, y: 900 },
      contact: { value: "Pedí al WhatsApp 351 000-0000", size: 34, color: "#FFF8F0", align: "center", x: 540, y: 1695 }
    },
    stickers: [],
    selectedStickerId: null,
    dragging: null,
    imageRequest: 0
  };
  const canvas = document.getElementById("flyerCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let toastTimer;
  let finalFlyerBlob = null;
  let finalFlyerUrl = null;

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3300);
  }

  function getPalette() { return palettes[state.paletteIndex].colors; }
  function getColor(index) { return getPalette()[index]; }

  function setImageGenerationBusy(isBusy) {
    const button = $("generateButton");
    const variantButton = $("variantButton");
    button.disabled = isBusy;
    variantButton.disabled = isBusy;
    button.querySelector(".generate-label").textContent = isBusy ? "Generando…" : "Generar solo fondo";
    variantButton.querySelector(".variant-label").textContent = isBusy ? "Generando…" : "Otra variante";
  }

  function cancelBackgroundGeneration() {
    state.imageRequest += 1;
    if (!state.activeGeneration) return;
    state.activeGeneration.resolve(false);
    state.activeGeneration = null;
  }

  function releasePendingBackgroundUpload() {
    if (!state.pendingUploadUrl) return;
    URL.revokeObjectURL(state.pendingUploadUrl);
    state.pendingUploadUrl = null;
  }

  function setBackgroundImage(image, uploadedUrl = null) {
    if (state.uploadedBackgroundUrl && state.uploadedBackgroundUrl !== uploadedUrl) {
      URL.revokeObjectURL(state.uploadedBackgroundUrl);
    }
    state.uploadedBackgroundUrl = uploadedUrl;
    state.backgroundImage = image;
  }

  function averageCornerColor(image, x, y, context) {
    const radius = 3;
    const left = Math.max(0, Math.min(image.naturalWidth - radius * 2 - 1, x - radius));
    const top = Math.max(0, Math.min(image.naturalHeight - radius * 2 - 1, y - radius));
    const pixels = context.getImageData(left, top, radius * 2 + 1, radius * 2 + 1).data;
    const total = { red: 0, green: 0, blue: 0 };
    for (let index = 0; index < pixels.length; index += 4) {
      total.red += pixels[index];
      total.green += pixels[index + 1];
      total.blue += pixels[index + 2];
    }
    const count = pixels.length / 4;
    return {
      red: total.red / count,
      green: total.green / count,
      blue: total.blue / count
    };
  }

  function isPollinationsLimitImage(image) {
    const probe = document.createElement("canvas");
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const probeContext = probe.getContext("2d", { willReadFrequently: true });
    if (!probeContext) throw new Error("No se pudo inspeccionar la imagen generada.");
    probeContext.drawImage(image, 0, 0);
    const left = averageCornerColor(image, 15, 15, probeContext);
    const right = averageCornerColor(image, image.naturalWidth - 15, 15, probeContext);
    const isBeige = (color) => color.red >= 200 && color.red <= 230 &&
      color.green >= 185 && color.green <= 215 && color.blue >= 150 && color.blue <= 185;
    const nearlySame = ["red", "green", "blue"].every((channel) =>
      Math.abs(left[channel] - right[channel]) <= 8
    );
    return isBeige(left) && isBeige(right) && nearlySame;
  }

  function loadImage(url, timeout = 8000, inspectPollinationsError = false) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve(image);
      };
      const timer = window.setTimeout(() => {
        image.src = "";
        finish(new Error("La carga de imagen superó el tiempo de espera."));
      }, timeout);
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          if (inspectPollinationsError && isPollinationsLimitImage(image)) {
            finish(new Error("Pollinations está temporalmente al límite."));
            return;
          }
          finish();
        } catch (error) {
          finish(error);
        }
      };
      image.onerror = () => finish(new Error("No se pudo cargar la imagen."));
      image.src = url;
    });
  }

  function getFallbackKeywords(description) {
    const normalized = description.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/\b(paisaje|naturaleza|montana|bosque|playa)\b/.test(normalized)) return "landscape,nature";
    if (/\b(burger|hamburguesa|comida|alimento|restaurante)\b/.test(normalized)) return "burger,food";
    if (/\b(zapateria|ropa|moda|zapatos|calzado)\b/.test(normalized)) return "fashion,shoes";
    if (/\b(peluqueria|estetica|belleza|salon)\b/.test(normalized)) return "beauty,salon";
    if (/\b(cafe|cafeteria)\b/.test(normalized)) return "coffee";
    return "abstract,gradient,texture";
  }

  function createArtisticBackground(width, height) {
    const art = document.createElement("canvas");
    art.width = width;
    art.height = height;
    const artContext = art.getContext("2d");
    if (!artContext) throw new Error("No se pudo crear el fondo artístico.");

    const gradient = artContext.createLinearGradient(0, 0, width * .85, height);
    gradient.addColorStop(0, getColor(0));
    gradient.addColorStop(.52, getColor(1));
    gradient.addColorStop(1, getColor(3));
    artContext.fillStyle = gradient;
    artContext.fillRect(0, 0, width, height);

    const glowSpots = [
      [width * .22, height * .2, width * .55, getColor(2)],
      [width * .82, height * .56, width * .48, getColor(0)],
      [width * .36, height * .9, width * .5, getColor(1)]
    ];
    glowSpots.forEach(([x, y, radius, color]) => {
      const glow = artContext.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `${color}66`);
      glow.addColorStop(1, `${color}00`);
      artContext.fillStyle = glow;
      artContext.fillRect(0, 0, width, height);
    });

    artContext.save();
    artContext.globalAlpha = .2;
    artContext.strokeStyle = getColor(2);
    artContext.lineWidth = Math.max(2, width * .003);
    artContext.beginPath();
    artContext.arc(width * .72, height * .28, width * .36, 0, Math.PI * 2);
    artContext.stroke();
    artContext.beginPath();
    artContext.arc(width * .72, height * .28, width * .25, 0, Math.PI * 2);
    artContext.stroke();
    artContext.globalAlpha = .12;
    artContext.fillStyle = getColor(2);
    artContext.beginPath();
    artContext.moveTo(width * .08, height * .78);
    artContext.lineTo(width * .48, height * .56);
    artContext.lineTo(width * .38, height * .96);
    artContext.closePath();
    artContext.fill();
    artContext.restore();

    const texture = artContext.createLinearGradient(0, 0, width, 0);
    texture.addColorStop(0, "rgba(255,255,255,.07)");
    texture.addColorStop(.5, "rgba(255,255,255,0)");
    texture.addColorStop(1, "rgba(0,0,0,.12)");
    artContext.fillStyle = texture;
    artContext.fillRect(0, 0, width, height);
    return art;
  }

  function buildPalettes() {
    const grid = $("paletteGrid");
    grid.innerHTML = "";
    palettes.forEach((palette, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `palette-button${index === state.paletteIndex ? " active" : ""}`;
      button.setAttribute("aria-label", `Paleta ${palette.name}`);
      button.setAttribute("aria-pressed", String(index === state.paletteIndex));
      const swatches = palette.colors.map((color) => `<i style="background:${color}"></i>`).join("");
      button.innerHTML = `<span class="swatches">${swatches}</span><span class="palette-name">${palette.name}</span>`;
      button.addEventListener("click", () => {
        state.paletteIndex = index;
        // Conserva cualquier color existente que no pertenezca a la paleta.
        refreshPaletteControls();
        render();
      });
      grid.appendChild(button);
    });
    refreshPaletteControls();
  }

  function refreshPaletteControls() {
    document.querySelectorAll(".palette-button").forEach((button, index) => {
      button.classList.toggle("active", index === state.paletteIndex);
      button.setAttribute("aria-pressed", String(index === state.paletteIndex));
    });
    const quickColors = $("quickColors");
    quickColors.replaceChildren();
    getPalette().forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-color";
      button.style.backgroundColor = color;
      button.title = color;
      button.setAttribute("aria-label", `Usar color ${color}`);
      button.addEventListener("click", () => {
        document.querySelectorAll(".quick-color").forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        $("backgroundColor").value = color;
        state.backgroundColor = color;
        render();
      });
      if (index === 0) button.classList.add("selected");
      quickColors.appendChild(button);
    });
    ["titleColor", "subtitleColor", "contactColor"].forEach((id) => {
      const select = $(id);
      const current = state.texts[id.replace("Color", "")].color;
      select.replaceChildren();
      getPalette().forEach((color) => {
        const option = document.createElement("option");
        option.value = color;
        option.textContent = color;
        select.appendChild(option);
      });
      if (!getPalette().includes(current)) {
        const option = document.createElement("option");
        option.value = current;
        option.textContent = `${current} · personalizado`;
        select.appendChild(option);
      }
      select.value = current;
      $(`${id.replace("Color", "")}CustomColor`).value = current;
    });
  }

  function resizeCanvas() {
    const [width, height] = sizes[state.format];
    canvas.width = width;
    canvas.height = height;
    document.documentElement.style.setProperty("--canvas-ratio", `${width} / ${height}`);
    const rect = $("canvasWrap").getBoundingClientRect();
    const previewLimit = Math.min(window.innerHeight * (window.innerWidth <= 680 ? .55 : .75), 770);
    $("canvasWrap").style.minHeight = `${Math.max(200, Math.min(rect.width * height / width, previewLimit))}px`;
    render();
  }

  function drawBackground() {
    const width = canvas.width;
    const height = canvas.height;
    if (state.backgroundImage && (state.backgroundImage.naturalWidth || state.backgroundImage.width)) {
      const image = state.backgroundImage;
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const imageWidth = sourceWidth * scale;
      const imageHeight = sourceHeight * scale;
      ctx.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
      const shade = ctx.createLinearGradient(0, 0, 0, height);
      shade.addColorStop(0, "rgba(10,8,24,.26)");
      shade.addColorStop(.18, "rgba(10,8,24,.08)");
      shade.addColorStop(.36, "rgba(10,8,24,0)");
      shade.addColorStop(.68, "rgba(10,8,24,0)");
      shade.addColorStop(.86, "rgba(10,8,24,.08)");
      shade.addColorStop(1, "rgba(10,8,24,.30)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    if (state.backgroundStyle === "solid") {
      ctx.fillStyle = state.backgroundColor;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, width * .8, height);
      gradient.addColorStop(0, getColor(0));
      gradient.addColorStop(.52, getColor(1));
      gradient.addColorStop(1, getColor(3));
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, width, height);
    // Formas decorativas sutiles para darle profundidad al fondo.
    const glow = ctx.createRadialGradient(width * .72, height * .28, 10, width * .72, height * .28, width * .7);
    glow.addColorStop(0, "rgba(255,255,255,.15)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.lineWidth = Math.max(2, width * .002);
    ctx.beginPath();
    ctx.arc(width * .5, height * .47, width * .38, 0, Math.PI * 2);
    ctx.stroke();
  }

  function wrapLines(text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawText(key) {
    const item = state.texts[key];
    if (!item.value.trim()) return;
    const font = fontPairs[state.fontPair][key === "title" ? "title" : "body"];
    const weight = key === "title" ? "400" : "800";
    ctx.save();
    ctx.font = `${weight} ${item.size}px "${font}", sans-serif`;
    ctx.textAlign = item.align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = item.color;
    ctx.shadowColor = "rgba(14, 10, 26, .34)";
    ctx.shadowBlur = key === "title" ? 14 : 8;
    ctx.shadowOffsetY = 4;
    const lines = wrapLines(item.value, canvas.width * .84);
    const lineHeight = item.size * (key === "title" ? 1.07 : 1.2);
    lines.forEach((line, index) => {
      ctx.fillText(line, item.x, item.y + (index - (lines.length - 1) / 2) * lineHeight, canvas.width * .88);
    });
    ctx.restore();
  }

  function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function drawSticker(sticker) {
    const scale = sticker.scale;
    const isSymbol = sticker.text === "★" || sticker.text === "➜";
    const fontSize = (isSymbol ? 118 : 40) * scale;
    ctx.save();
    ctx.translate(sticker.x, sticker.y);
    ctx.font = `900 ${fontSize}px "Montserrat", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (sticker.text === "★") {
      ctx.fillStyle = getColor(1);
      ctx.strokeStyle = getColor(2);
      ctx.lineWidth = 6 * scale;
      ctx.shadowColor = "rgba(0,0,0,.2)";
      ctx.shadowBlur = 12;
      ctx.strokeText("★", 0, 0);
      ctx.fillText("★", 0, 0);
    } else if (sticker.text === "➜") {
      ctx.fillStyle = getColor(0);
      ctx.shadowColor = "rgba(0,0,0,.18)";
      ctx.shadowBlur = 10;
      ctx.fillText("➜", 0, 0);
    } else {
      const label = sticker.text.split(" ");
      const lines = sticker.text === "50% OFF" || sticker.text === "ENVÍO GRATIS" ? label :
        sticker.text === "PEDÍ POR WHATSAPP" ? ["PEDÍ POR", "WHATSAPP"] : [sticker.text];
      const lineHeight = fontSize * .95;
      const max = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const padX = 25 * scale;
      const padY = 17 * scale;
      const boxWidth = max + padX * 2;
      const boxHeight = lines.length * lineHeight + padY * 2;
      ctx.fillStyle = getColor(2);
      ctx.strokeStyle = getColor(0);
      ctx.lineWidth = 6 * scale;
      ctx.shadowColor = "rgba(0,0,0,.22)";
      ctx.shadowBlur = 12;
      roundedRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, 19 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = getColor(3);
      lines.forEach((line, index) => ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight));
    }
    if (state.selectedStickerId === sticker.id) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(-85 * scale, -45 * scale, 170 * scale, 90 * scale);
    }
    ctx.restore();
  }

  function render() {
    if (!canvas.width || !canvas.height) return;
    drawBackground();
    drawText("title");
    drawText("subtitle");
    drawText("contact");
    state.stickers.forEach(drawSticker);
  }

  function setFormat(format) {
    state.format = format;
    document.querySelectorAll(".format-option").forEach((button) => {
      const active = button.dataset.format === format;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const [, height] = sizes[format];
    if (format === "story") {
      state.texts.title.y = 765;
      state.texts.subtitle.y = 900;
      state.texts.contact.y = 1695;
    } else {
      state.texts.title.y = 420;
      state.texts.subtitle.y = 540;
      state.texts.contact.y = 900;
    }
    state.stickers.forEach((item, index) => {
      item.y = height * (.55 + (index % 3) * .1);
    });
    resizeCanvas();
  }

  function setText(key, property, value) {
    state.texts[key][property] = value;
    render();
  }

  function generateBackground() {
    const description = $("backgroundPrompt").value.trim();
    if (!description) {
      showToast("Contame qué imagen tenés en mente para generar el fondo.");
      $("backgroundPrompt").focus();
      return Promise.resolve(false);
    }
    if (state.activeGeneration) {
      if (state.activeGeneration.prompt === description) return state.activeGeneration.promise;
      state.activeGeneration.resolve(false);
      state.activeGeneration = null;
    }

    const requestId = ++state.imageRequest;
    const hadPendingUpload = Boolean(state.pendingUploadUrl);
    releasePendingBackgroundUpload();
    if (hadPendingUpload) $("createFinalButton").disabled = false;
    setImageGenerationBusy(true);
    state.backgroundModeChosen = false;
    $("imageHint").textContent = "Estamos preparando tu fondo, puede tardar unos segundos…";
    const promptMejorado = `${description}, professional commercial food and product photography, appetizing, studio lighting, vivid colors, ultra sharp, clean aesthetic, no text, no watermark, no weird artifacts`;
    const seed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptMejorado)}?width=768&height=1024&nologo=true&seed=${seed}`;
    const [width, height] = sizes[state.format];
    const fallbackUrl = `https://loremflickr.com/${width}/${height}/${getFallbackKeywords(description)}`;
    let resolveGeneration;
    const promise = new Promise((resolve) => { resolveGeneration = resolve; });
    state.activeGeneration = { prompt: description, requestId, promise, resolve: resolveGeneration };
    const finishGeneration = (image, source) => {
      if (requestId !== state.imageRequest) {
        resolveGeneration(false);
        return false;
      }
      state.activeGeneration = null;
      setBackgroundImage(image);
      state.generatedPrompt = description;
      $("backgroundStyle").value = "gradient";
      $("imageHint").textContent = source === "pollinations"
        ? "Fondo listo. Podés seguir editando o descargar tu flyer."
        : "Fondo listo con una alternativa automática. Podés seguir editando o descargar tu flyer.";
      setImageGenerationBusy(false);
      render();
      showToast(source === "pollinations"
        ? "¡Fondo generado! Ya podés personalizar tu flyer."
        : "Preparamos un fondo alternativo para tu flyer.");
      resolveGeneration(true);
      return true;
    };

    const useArtisticFallback = () => {
      if (requestId !== state.imageRequest) {
        resolveGeneration(false);
        return;
      }
      const art = createArtisticBackground(width, height);
      finishGeneration(art, "artistic");
    };

    loadImage(pollinationsUrl, 8000, true)
      .then((image) => finishGeneration(image, "pollinations"))
      .catch(() => {
        if (requestId !== state.imageRequest) {
          resolveGeneration(false);
          return;
        }
        return loadImage(fallbackUrl, 8000)
          .then((image) => finishGeneration(image, "fallback"))
          .catch(() => useArtisticFallback());
      })
      .catch((error) => {
        console.error("No se pudo preparar un fondo alternativo.", error);
        if (requestId === state.imageRequest) {
          state.activeGeneration = null;
          setImageGenerationBusy(false);
          $("imageHint").textContent = "No se pudo preparar un fondo. Revisá tu navegador e intentá de nuevo.";
          showToast("No pudimos preparar el fondo. Probá otra vez o elegí un color de paleta.");
          resolveGeneration(false);
        }
      });
    return promise;
  }

  function loadUploadedBackground(event) {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    if (!file) return;
    input.value = "";
    if (file.type && !file.type.startsWith("image/")) {
      showToast("Elegí un archivo de imagen para usarlo como fondo.");
      return;
    }

    cancelBackgroundGeneration();
    setImageGenerationBusy(false);
    $("createFinalButton").disabled = true;
    releasePendingBackgroundUpload();
    const requestId = state.imageRequest;
    const objectUrl = URL.createObjectURL(file);
    state.pendingUploadUrl = objectUrl;
    const image = new Image();
    image.onload = () => {
      if (requestId !== state.imageRequest) {
        if (state.pendingUploadUrl === objectUrl) state.pendingUploadUrl = null;
        URL.revokeObjectURL(objectUrl);
        return;
      }
      if (state.pendingUploadUrl === objectUrl) state.pendingUploadUrl = null;
      setBackgroundImage(image, objectUrl);
      state.backgroundStyle = "gradient";
      state.generatedPrompt = null;
      state.backgroundModeChosen = false;
      $("backgroundStyle").value = "gradient";
      $("imageHint").textContent = "Tu foto está lista como fondo. Textos y stickers quedan por encima.";
      $("createFinalButton").disabled = false;
      render();
      showToast("¡Foto cargada! Ya podés ubicar tus textos y stickers.");
    };
    image.onerror = () => {
      if (state.pendingUploadUrl === objectUrl) state.pendingUploadUrl = null;
      URL.revokeObjectURL(objectUrl);
      if (requestId !== state.imageRequest) return;
      $("createFinalButton").disabled = false;
      $("imageHint").textContent = "No se pudo abrir esa foto. Probá con otro archivo de imagen.";
      showToast("No pudimos cargar esa foto. Elegí otra imagen e intentá de nuevo.");
    };
    image.src = objectUrl;
  }

  function addSticker(text) {
    const width = canvas.width;
    const height = canvas.height;
    const sticker = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      x: width * .72,
      y: height * .49,
      scale: 1
    };
    state.stickers.push(sticker);
    selectSticker(sticker.id);
    render();
  }

  function selectSticker(id) {
    state.selectedStickerId = id;
    const sticker = state.stickers.find((item) => item.id === id);
    $("stickerControls").hidden = !sticker;
    if (sticker) $("stickerSize").value = sticker.scale;
  }

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  }

  function hitText(point) {
    const ordered = ["contact", "subtitle", "title"];
    for (const key of ordered) {
      const item = state.texts[key];
      if (!item.value.trim()) continue;
      const font = fontPairs[state.fontPair][key === "title" ? "title" : "body"];
      ctx.save();
      ctx.font = `${key === "title" ? "400" : "800"} ${item.size}px "${font}", sans-serif`;
      const lines = wrapLines(item.value, canvas.width * .84);
      const lineHeight = item.size * (key === "title" ? 1.07 : 1.2);
      const maxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      ctx.restore();
      const height = lines.length * lineHeight;
      if (Math.abs(point.y - item.y) <= height / 2 + 20 && Math.abs(point.x - item.x) <= maxWidth / 2 + 35) return key;
    }
    return null;
  }

  function hitSticker(point) {
    for (let index = state.stickers.length - 1; index >= 0; index -= 1) {
      const sticker = state.stickers[index];
      if (Math.abs(point.x - sticker.x) < 150 * sticker.scale && Math.abs(point.y - sticker.y) < 90 * sticker.scale) return sticker;
    }
    return null;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const point = toCanvasPoint(event);
    const sticker = hitSticker(point);
    if (sticker) {
      selectSticker(sticker.id);
      state.dragging = { type: "sticker", id: sticker.id };
    } else {
      selectSticker(null);
      const textKey = hitText(point);
      state.dragging = textKey ? { type: "text", key: textKey } : null;
    }
    if (state.dragging) {
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("dragging");
    }
    render();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const point = toCanvasPoint(event);
    if (state.dragging.type === "text") {
      const item = state.texts[state.dragging.key];
      item.x = Math.max(20, Math.min(canvas.width - 20, point.x));
      item.y = Math.max(35, Math.min(canvas.height - 35, point.y));
    } else {
      const item = state.stickers.find((sticker) => sticker.id === state.dragging.id);
      if (item) {
        item.x = Math.max(50, Math.min(canvas.width - 50, point.x));
        item.y = Math.max(50, Math.min(canvas.height - 50, point.y));
      }
    }
    render();
  });
  const stopDragging = () => {
    state.dragging = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);

  async function createFlyerBlob() {
    const selectedStickerId = state.selectedStickerId;
    state.selectedStickerId = null;
    try {
      render();
      return await new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("No se pudo generar el PNG."));
          }, "image/png");
        } catch (error) {
          reject(error);
        }
      });
    } finally {
      state.selectedStickerId = selectedStickerId;
      render();
    }
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `promosia-flyer-${state.format}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadFlyer() {
    try {
      downloadBlob(await createFlyerBlob());
    } catch (error) {
      console.error("No se pudo exportar el flyer.", error);
      showToast("No se pudo exportar el flyer. Revisá el fondo o probá con un color de paleta.");
    }
  }

  async function openFinalPreview() {
    const modal = $("finalPreviewModal");
    const trigger = $("createFinalButton");
    const image = $("finalFlyerImage");
    const loading = $("finalImageLoading");
    trigger.disabled = true;
    state.selectedStickerId = null;
    $("stickerControls").hidden = true;
    image.hidden = true;
    loading.hidden = false;
    loading.textContent = "Preparando tu flyer en alta calidad…";
    $("finalDownloadButton").disabled = true;
    $("finalShareButton").disabled = true;
    if (!modal.open) modal.showModal();

    try {
      const blob = await createFlyerBlob();
      if (!modal.open) return;
      if (finalFlyerUrl) URL.revokeObjectURL(finalFlyerUrl);
      finalFlyerBlob = blob;
      finalFlyerUrl = URL.createObjectURL(blob);
      image.src = finalFlyerUrl;
      image.hidden = false;
      loading.hidden = true;
      $("finalDownloadButton").disabled = false;
      $("finalShareButton").disabled = false;
    } catch (error) {
      console.error("No se pudo preparar la vista previa final.", error);
      loading.textContent = "No se pudo preparar la imagen. Revisá el fondo e intentá otra vez.";
      showToast("No se pudo preparar el flyer final. Probá con un fondo de color o paleta.");
    } finally {
      trigger.disabled = Boolean(state.pendingUploadUrl);
    }
  }

  async function createFlyerAndPreview() {
    const trigger = $("createFinalButton");
    if (trigger.disabled) return;
    trigger.disabled = true;
    try {
      let description = $("backgroundPrompt").value.trim();
      if (state.activeGeneration) {
        const activeGeneration = state.activeGeneration;
        const generated = description && description !== activeGeneration.prompt
          ? await generateBackground()
          : await activeGeneration.promise;
        if (!generated) return;
      }

      description = $("backgroundPrompt").value.trim();
      const hasUploadedPhoto = Boolean(state.uploadedBackgroundUrl && state.backgroundImage);
      const hasMatchingGeneratedImage = Boolean(
        state.backgroundImage && !hasUploadedPhoto && state.generatedPrompt === description
      );
      const shouldGenerate = description && !hasUploadedPhoto && !state.backgroundModeChosen && !hasMatchingGeneratedImage;
      if (shouldGenerate && !(await generateBackground())) return;
      await openFinalPreview();
    } finally {
      trigger.disabled = Boolean(state.pendingUploadUrl);
    }
  }

  async function shareFlyer() {
    if (!finalFlyerBlob) {
      showToast("Primero generá la vista previa final del flyer.");
      return;
    }
    if (typeof File === "undefined") {
      showToast("Descargá el PNG y adjuntalo en WhatsApp o tus redes.");
      return;
    }
    const file = new File([finalFlyerBlob], `promosia-flyer-${state.format}.png`, { type: "image/png" });
    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] })) {
      showToast("Descargá el PNG y adjuntalo en WhatsApp o tus redes.");
      return;
    }
    try {
      await navigator.share({
        files: [file],
        title: "Mi flyer de PromosIA",
        text: "¡Mirá la promo que preparé con PromosIA!"
      });
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("No se pudo compartir el flyer.", error);
      showToast("No se pudo compartir. Descargá el PNG y adjuntalo en WhatsApp o tus redes.");
    }
  }

  function reset() {
    state.format = "story";
    state.paletteIndex = 2;
    state.backgroundStyle = "gradient";
    state.backgroundColor = "#0066ff";
    state.fontPair = "urban";
    state.stickers = [];
    state.selectedStickerId = null;
    cancelBackgroundGeneration();
    releasePendingBackgroundUpload();
    setBackgroundImage(null);
    state.generatedPrompt = null;
    state.backgroundModeChosen = false;
    releasePendingBackgroundUpload();
    setBackgroundImage(null);
    state.texts = {
      title: { value: "2x1 EN BURGERS", size: 112, color: "#FFF8F0", align: "center", x: 540, y: 765 },
      subtitle: { value: "Solo por hoy · Envío sin cargo", size: 44, color: "#FFF8F0", align: "center", x: 540, y: 900 },
      contact: { value: "Pedí al WhatsApp 351 000-0000", size: 34, color: "#FFF8F0", align: "center", x: 540, y: 1695 }
    };
    $("backgroundPrompt").value = "";
    $("uploadBgInput").value = "";
    $("backgroundStyle").value = "gradient";
    $("backgroundColor").value = state.backgroundColor;
    $("fontPair").value = "urban";
    $("titleText").value = state.texts.title.value;
    $("subtitleText").value = state.texts.subtitle.value;
    $("contactText").value = state.texts.contact.value;
    $("titleSize").value = 112;
    $("subtitleSize").value = 44;
    $("contactSize").value = 34;
    ["title", "subtitle", "contact"].forEach((key) => {
      $(`${key}Align`).value = "center";
    });
    $("imageHint").textContent = "Generá un fondo publicitario sin texto. Podés pedir otra variante con la misma idea.";
    $("stickerControls").hidden = true;
    setImageGenerationBusy(false);
    $("createFinalButton").disabled = false;
    setFormat("story");
    buildPalettes();
    render();
  }

  document.querySelectorAll(".format-option").forEach((button) => {
    button.addEventListener("click", () => setFormat(button.dataset.format));
  });
  $("backgroundStyle").addEventListener("change", (event) => {
    state.backgroundStyle = event.target.value;
    state.backgroundModeChosen = true;
    state.generatedPrompt = null;
    cancelBackgroundGeneration();
    releasePendingBackgroundUpload();
    setImageGenerationBusy(false);
    setBackgroundImage(null);
    $("imageHint").textContent = state.backgroundStyle === "solid"
      ? "Fondo sólido seleccionado. Podés subir otra foto cuando quieras."
      : "Degradado de paleta seleccionado. Podés subir otra foto cuando quieras.";
    $("createFinalButton").disabled = false;
    render();
  });
  $("uploadBgButton").addEventListener("click", () => $("uploadBgInput").click());
  $("uploadBgInput").addEventListener("change", loadUploadedBackground);
  $("backgroundColor").addEventListener("input", (event) => {
    state.backgroundColor = event.target.value;
    document.querySelectorAll(".quick-color").forEach((button) => button.classList.remove("selected"));
    render();
  });
  $("generateButton").addEventListener("click", generateBackground);
  $("variantButton").addEventListener("click", generateBackground);
  $("backgroundPrompt").addEventListener("keydown", (event) => {
    if (event.key === "Enter") generateBackground();
  });
  $("fontPair").addEventListener("change", (event) => { state.fontPair = event.target.value; render(); });
  ["title", "subtitle", "contact"].forEach((key) => {
    $(`${key}Text`).addEventListener("input", (event) => setText(key, "value", event.target.value));
    $(`${key}Size`).addEventListener("input", (event) => setText(key, "size", Number(event.target.value)));
    $(`${key}Color`).addEventListener("change", (event) => {
      state.texts[key].color = event.target.value;
      $(`${key}CustomColor`).value = event.target.value;
      render();
    });
    $(`${key}CustomColor`).addEventListener("input", (event) => {
      state.texts[key].color = event.target.value;
      $(`${key}Color`).value = event.target.value;
      render();
    });
    $(`${key}Align`).addEventListener("change", (event) => setText(key, "align", event.target.value));
  });
  document.querySelectorAll(".sticker-button").forEach((button) => {
    button.addEventListener("click", () => addSticker(button.dataset.sticker));
  });
  $("stickerSize").addEventListener("input", (event) => {
    const selected = state.stickers.find((item) => item.id === state.selectedStickerId);
    if (selected) {
      selected.scale = Number(event.target.value);
      render();
    }
  });
  $("deleteSticker").addEventListener("click", () => {
    state.stickers = state.stickers.filter((item) => item.id !== state.selectedStickerId);
    selectSticker(null);
    render();
  });
  $("downloadButton").addEventListener("click", downloadFlyer);
  $("createFinalButton").addEventListener("click", createFlyerAndPreview);
  $("finalDownloadButton").addEventListener("click", () => {
    if (finalFlyerBlob) downloadBlob(finalFlyerBlob);
  });
  $("finalShareButton").addEventListener("click", shareFlyer);
  $("finalContinueButton").addEventListener("click", () => $("finalPreviewModal").close());
  $("closeFinalPreview").addEventListener("click", () => $("finalPreviewModal").close());
  $("finalPreviewModal").addEventListener("click", (event) => {
    if (event.target === $("finalPreviewModal")) $("finalPreviewModal").close();
  });
  $("finalPreviewModal").addEventListener("close", () => {
    if (finalFlyerUrl) URL.revokeObjectURL(finalFlyerUrl);
    finalFlyerBlob = null;
    finalFlyerUrl = null;
    $("finalFlyerImage").removeAttribute("src");
    $("finalFlyerImage").hidden = true;
    $("finalImageLoading").hidden = false;
    $("finalImageLoading").textContent = "Preparando tu flyer en alta calidad…";
    $("finalDownloadButton").disabled = true;
    $("finalShareButton").disabled = true;
  });
  $("resetButton").addEventListener("click", reset);
  window.addEventListener("resize", resizeCanvas);

  buildPalettes();
  resizeCanvas();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("No se pudo registrar el modo sin conexión de PromosIA.", error);
      });
    });
  }
})();
