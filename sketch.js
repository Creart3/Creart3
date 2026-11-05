// --- Configuración ---
// Canvas cuadrado: el video se recorta en el centro para llenarlo sin deformarse.
const ANCHO_CANVAS = 640;
const ALTO_CANVAS = 640;
const ESPERA_MAXIMA_MS = 6000;

// --- Estado de la cámara ---
// Valores posibles: "esperando" | "funcionando" | "error"
let estadoCamara = "esperando";
let mensajeError = "";
let captura = null;

function setup() {
  createCanvas(ANCHO_CANVAS, ALTO_CANVAS);
  pedirCamara();
}

function draw() {
  if (estadoCamara === "error") {
    dibujarPantallaError();
    return;
  }

  background(20);

  if (estadoCamara === "funcionando" && captura) {
    dibujarCamaraEspejada();
  }

  dibujarBarraEstado();
}

// Pide permiso y crea la captura de video de p5.
async function pedirCamara() {
  // getUserMedia solo existe si la página se sirve en localhost o HTTPS.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarError(
      "Este navegador no puede acceder a la cámara desde esta página. " +
        "Abrí el proyecto en localhost o en HTTPS."
    );
    return;
  }

  try {
    // Pedimos permiso primero para poder leer el error real si falla
    // (p5 oculta el motivo dentro de createCapture).
    const flujoPrueba = await navigator.mediaDevices.getUserMedia({ video: true });
    flujoPrueba.getTracks().forEach((pista) => pista.stop());
  } catch (error) {
    console.error("Error al pedir la cámara:", error);
    mostrarError(describirError(error));
    return;
  }

  // Con el permiso concedido, p5 crea el <video> y lo conecta a la cámara.
  // La función final se ejecuta cuando el video ya tiene datos.
  captura = createCapture(
    { video: { width: ANCHO_CANVAS, height: ALTO_CANVAS }, audio: false },
    () => {
      estadoCamara = "funcionando";
    }
  );

  // El <video> que crea p5 se oculta: nosotros lo dibujamos en el canvas.
  captura.hide();

  // Red de seguridad: si el video nunca arranca, avisamos igual.
  setTimeout(() => {
    if (estadoCamara !== "funcionando") {
      console.error("La captura de video no arrancó a tiempo.");
      mostrarError(
        "La cámara no respondió. Cerrá otras aplicaciones que la estén usando y recargá la página."
      );
    }
  }, ESPERA_MAXIMA_MS);
}

// Dibuja el video en espejo, como si fuera un reflejo.
// Recorta un cuadrado del centro del video para llenar el canvas sin deformarlo.
function dibujarCamaraEspejada() {
  const anchoVideo = captura.width;
  const altoVideo = captura.height;

  // Tomamos el lado más chico como tamaño del recorte cuadrado
  const ladoRecorte = Math.min(anchoVideo, altoVideo);

  // Centramos ese cuadrado dentro del video original
  const xRecorte = (anchoVideo - ladoRecorte) / 2;
  const yRecorte = (altoVideo - ladoRecorte) / 2;

  push();
  translate(width, 0); // Movemos el origen al borde derecho
  scale(-1, 1); // Invertimos el eje X
  // image(imagen, xOrigen, yOrigen, anchoOrigen, altoOrigen, x, y, ancho, alto)
  image(
    captura,
    xRecorte,
    yRecorte,
    ladoRecorte,
    ladoRecorte,
    0,
    0,
    width,
    height
  );
  pop();
}

// Barra superior con el estado y los FPS.
function dibujarBarraEstado() {
  noStroke();
  fill(0, 0, 0, 160);
  rect(0, 0, width, 40);

  fill(255);
  textSize(16);
  textAlign(LEFT, CENTER);
  text(textoEstado(), 16, 20);
}

function textoEstado() {
  if (estadoCamara === "funcionando") {
    return "Cámara funcionando · " + frameRate().toFixed(1) + " FPS";
  }
  return "Esperando permiso de cámara...";
}

function dibujarPantallaError() {
  background(20);
  fill(255, 120, 120);
  textSize(20);
  textAlign(CENTER, CENTER);
  text(mensajeError, width / 2, height / 2, width - 80, height - 80);
}

function mostrarError(mensaje) {
  estadoCamara = "error";
  mensajeError = mensaje;
  console.error(mensaje);
}

// Traduce el error del navegador a un mensaje entendible.
function describirError(error) {
  switch (error.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso de cámara denegado. Habilitalo desde el ícono de la barra de direcciones y recargá la página.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró ninguna cámara conectada a este dispositivo.";
    case "NotReadableError":
      return "La cámara está siendo usada por otra aplicación.";
    default:
      return "No se pudo iniciar la cámara: " + error.message;
  }
}
