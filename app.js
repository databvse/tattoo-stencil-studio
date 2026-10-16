
const imageInput = document.getElementById("imageInput");
const original = document.getElementById("original");
const output = document.getElementById("output");
const ctx = output.getContext("2d", { willReadFrequently: true });
const statusText = document.getElementById("status");
const downloadBtn = document.getElementById("download");

const controls = {
  contrast: document.getElementById("contrast"),
  brightness: document.getElementById("brightness"),
  threshold: document.getElementById("threshold"),
  detail: document.getElementById("detail"),
  invert: document.getElementById("invert")
};

const outputs = {
  contrast: document.getElementById("contrastValue"),
  brightness: document.getElementById("brightnessValue"),
  threshold: document.getElementById("thresholdValue"),
  detail: document.getElementById("detailValue")
};

let sourceImage = null;
let selectedMode = "gray";
let renderVersion = 0;

function setStatus(message) {
  statusText.textContent = message;
}

function updateLabels() {
  Object.keys(outputs).forEach(key => {
    outputs[key].value = controls[key].value;
    outputs[key].textContent = controls[key].value;
  });
}

function getGray(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Selecciona un archivo de imagen válido.");
    return;
  }

  const reader = new FileReader();

  reader.onerror = () => {
    setStatus("No se pudo leer la imagen.");
  };

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      sourceImage = img;
      original.src = reader.result;
      original.hidden = false;

      document.getElementById("originalEmpty").hidden = true;
      document.getElementById("outputEmpty").hidden = true;
      output.hidden = false;
      downloadBtn.disabled = false;

      setStatus(
        `Imagen cargada: ${img.naturalWidth} × ${img.naturalHeight} px`
      );

      renderImage();
    };

    img.onerror = () => {
      setStatus("No se pudo abrir esta imagen.");
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function renderImage() {
  if (!sourceImage) return;

  const thisRender = ++renderVersion;
  setStatus("Procesando imagen…");

  // Reducimos imágenes enormes para que el iPhone
  // pueda procesarlas sin consumir demasiada memoria.
  const maxSide = 1400;
  const scale = Math.min(
    1,
    maxSide / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight)
  );

  const width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
  const height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));

  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;

  const workCtx = work.getContext("2d", {
    willReadFrequently: true
  });

  workCtx.drawImage(sourceImage, 0, 0, width, height);

  const frame = workCtx.getImageData(0, 0, width, height);
  const pixels = frame.data;

  const contrast = Number(controls.contrast.value);
  const brightness = Number(controls.brightness.value);
  const threshold = Number(controls.threshold.value);
  const detail = Number(controls.detail.value);
  const invert = controls.invert.checked;

  // Convertimos a escala de grises y ajustamos contraste.
  const factor = (259 * (contrast + 255)) /
    (255 * (259 - contrast));

  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    let value = getGray(pixels[i], pixels[i + 1], pixels[i + 2]);

    value = factor * (value - 128) + 128 + brightness;
    gray[p] = clamp(value);
  }

  const result = new ImageData(width, height);
  const dst = result.data;

  if (selectedMode === "edges") {
    // Detector de contornos Sobel.
    // Calcula cambios de luminosidad entre píxeles.
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;

        const a = gray[p - width - 1];
        const b = gray[p - width];
        const c = gray[p - width + 1];
        const d = gray[p - 1];
        const f = gray[p + 1];
        const g = gray[p + width - 1];
        const h = gray[p + width];
        const j = gray[p + width + 1];

        const gx = -a + c - 2 * d + 2 * f - g + j;
        const gy = -a - 2 * b - c + g + 2 * h + j;

        const strength = Math.sqrt(gx * gx + gy * gy);
        let value = 255 - strength * (detail / 45);

        value = clamp(value);

        if (invert) value = 255 - value;

        const i = p * 4;
        dst[i] = dst[i + 1] = dst[i + 2] = value;
        dst[i + 3] = 255;
      }
    }

    // Bordes exteriores en blanco.
    for (let x = 0; x < width; x++) {
      [x, (height - 1) * width + x].forEach(p => {
        const i = p * 4;
        dst[i] = dst[i + 1] = dst[i + 2] = invert ? 0 : 255;
        dst[i + 3] = 255;
      });
    }

    for (let y = 0; y < height; y++) {
      [y * width, y * width + width - 1].forEach(p => {
        const i = p * 4;
        dst[i] = dst[i + 1] = dst[i + 2] = invert ? 0 : 255;
        dst[i + 3] = 255;
      });
    }
  } else {
    for (let p = 0; p < gray.length; p++) {
      let value = gray[p];

      if (selectedMode === "threshold") {
        value = value < threshold ? 0 : 255;
      } else if (selectedMode === "dots") {
        // Mapa tonal de 5 niveles.
        // Es una guía de valores, no puntillismo real.
        value = Math.round(value / 51) * 51;
      }

      if (invert) value = 255 - value;

      const i = p * 4;
      dst[i] = dst[i + 1] = dst[i + 2] = value;
      dst[i + 3] = 255;
    }
  }

  if (thisRender !== renderVersion) return;

  output.width = width;
  output.height = height;
  ctx.putImageData(result, 0, 0);

  setStatus(
    `Listo · ${width} × ${height} px · Estilo: ${selectedMode}`
  );
}

imageInput.addEventListener("change", event => {
  loadImage(event.target.files[0]);
});

document.querySelectorAll(".mode").forEach(button => {
  button.addEventListener("click", () => {
    selectedMode = button.dataset.mode;

    document.querySelectorAll(".mode").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderImage();
  });
});

Object.values(controls).forEach(control => {
  control.addEventListener("input", () => {
    updateLabels();
    renderImage();
  });
});

document.getElementById("reset").addEventListener("click", () => {
  controls.contrast.value = 25;
  controls.brightness.value = 0;
  controls.threshold.value = 120;
  controls.detail.value = 45;
  controls.invert.checked = false;

  selectedMode = "gray";

  document.querySelectorAll(".mode").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.mode === selectedMode
    );
  });

  updateLabels();
  renderImage();
});

downloadBtn.addEventListener("click", () => {
  if (!sourceImage || !output.width) return;

  output.toBlob(blob => {
    if (!blob) {
      setStatus("No se pudo exportar. Inténtalo otra vez.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "stencil-tattoo.png";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setStatus("PNG preparado para guardar en Archivos o Fotos.");
  }, "image/png");
});

updateLabels();
