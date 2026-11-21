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
    if (state.backgroundImage && state.backgroundImage.complete && state.backgroundImage.naturalWidth) {
      const image = state.backgroundImage;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
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
      return;
    }
    const button = $("generateButton");
    const variantButton = $("variantButton");
    const requestId = ++state.imageRequest;
    button.disabled = true;
    variantButton.disabled = true;
    button.querySelector(".generate-label").textContent = "Generando…";
    variantButton.querySelector(".variant-label").textContent = "Generando…";
    $("imageHint").textContent = "Estamos preparando tu fondo, puede tardar unos segundos…";
    const [width, height] = sizes[state.format];
    const prompt = `${description}, vibrant commercial advertising photography, bright modern lighting, vivid colors, clean composition, high aesthetic quality, 8k, no text, no letters, no watermark`;
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&enhance=true&seed=${seed}`;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (requestId !== state.imageRequest) return;
      state.backgroundImage = image;
      $("backgroundStyle").value = "gradient";
      $("imageHint").textContent = "Fondo listo. Podés seguir editando o descargar tu flyer.";
      button.disabled = false;
      variantButton.disabled = false;
      button.querySelector(".generate-label").textContent = "Generar fondo";
      variantButton.querySelector(".variant-label").textContent = "Otra variante";
      render();
      showToast("¡Fondo generado! Ya podés personalizar tu flyer.");
    };
    image.onerror = () => {
      if (requestId !== state.imageRequest) return;
      button.disabled = false;
      variantButton.disabled = false;
      button.querySelector(".generate-label").textContent = "Generar fondo";
      variantButton.querySelector(".variant-label").textContent = "Otra variante";
      $("imageHint").textContent = "No se pudo cargar la imagen. Revisá tu conexión e intentá de nuevo.";
      showToast("No pudimos generar el fondo. Probá otra vez o usá un color de paleta.");
    };
    image.src = url;
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
      trigger.disabled = false;
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
    state.backgroundImage = null;
    state.fontPair = "urban";
    state.stickers = [];
    state.selectedStickerId = null;
    state.imageRequest += 1;
    state.texts = {
      title: { value: "2x1 EN BURGERS", size: 112, color: "#FFF8F0", align: "center", x: 540, y: 765 },
      subtitle: { value: "Solo por hoy · Envío sin cargo", size: 44, color: "#FFF8F0", align: "center", x: 540, y: 900 },
      contact: { value: "Pedí al WhatsApp 351 000-0000", size: 34, color: "#FFF8F0", align: "center", x: 540, y: 1695 }
    };
    $("backgroundPrompt").value = "";
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
    const button = $("generateButton");
    button.disabled = false;
    button.querySelector(".generate-label").textContent = "Generar fondo";
    const variantButton = $("variantButton");
    variantButton.disabled = false;
    variantButton.querySelector(".variant-label").textContent = "Otra variante";
    setFormat("story");
    buildPalettes();
    render();
  }

  document.querySelectorAll(".format-option").forEach((button) => {
    button.addEventListener("click", () => setFormat(button.dataset.format));
  });
  $("backgroundStyle").addEventListener("change", (event) => {
    state.backgroundStyle = event.target.value;
    if (state.backgroundStyle === "solid") state.backgroundImage = null;
    render();
  });
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
  $("createFinalButton").addEventListener("click", openFinalPreview);
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
