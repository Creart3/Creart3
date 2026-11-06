// --- Configuración ---
// Canvas cuadrado: el video se recorta en el centro para llenarlo sin deformarse.
const ANCHO_CANVAS = 640;
const ALTO_CANVAS = 640;
const ESPERA_MAXIMA_MS = 6000;
// Solo dibujamos puntos en los que el modelo confía lo suficiente.
const CONFIANZA_MINIMA = 0.3;

// --- Estado de la cámara ---
// Valores posibles: "esperando" | "funcionando" | "error"
let estadoCamara = "esperando";
let mensajeErrorCamara = "";
let captura = null;

// --- Estado de los modelos ---
// Valores posibles: "cargando" | "listo" | "activo" | "error"
let modeloCuerpo = null;
let estadoCuerpo = "cargando";
let posesDetectadas = [];
let conexionesCuerpo = [];
let mensajeErrorCuerpo = "";

let modeloManos = null;
let estadoManos = "cargando";
let manosDetectadas = [];
let conexionesManos = [];
let mensajeErrorManos = "";

function setup() {
  // Creamos el canvas y lo metemos en la columna derecha del layout
  const lienzo = createCanvas(ANCHO_CANVAS, ALTO_CANVAS);
  lienzo.parent("columna-camara");

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
    dibujarCuerpo();
    dibujarManos();
  }

  dibujarEstado();
}

// Pide permiso y crea la captura de video de p5.
async function pedirCamara() {
  // getUserMedia solo existe si la página se sirve en localhost o HTTPS.
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarErrorCamara(
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
    mostrarErrorCamara(describirErrorCamara(error));
    return;
  }

  // Con el permiso concedido, p5 crea el <video> y lo conecta a la cámara.
  // La función final se ejecuta cuando el video ya tiene datos.
  captura = createCapture(
    { video: { width: ANCHO_CANVAS, height: ALTO_CANVAS }, audio: false },
    () => {
      estadoCamara = "funcionando";
      // Recién con el video andando tiene sentido cargar los modelos
      cargarModelos();
    }
  );

  // El <video> que crea p5 se oculta: nosotros lo dibujamos en el canvas.
  captura.hide();

  // Red de seguridad: si el video nunca arranca, avisamos igual.
  setTimeout(() => {
    if (estadoCamara !== "funcionando") {
      console.error("La captura de video no arrancó a tiempo.");
      mostrarErrorCamara(
        "La cámara no respondió. Cerrá otras aplicaciones que la estén usando y recargá la página."
      );
    }
  }, ESPERA_MAXIMA_MS);
}

// Carga los dos modelos de ml5 en paralelo.
function cargarModelos() {
  if (typeof ml5 === "undefined") {
    estadoCuerpo = "error";
    estadoManos = "error";
    mensajeErrorCuerpo = "ml5 no cargó (revisá la conexión)";
    mensajeErrorManos = "ml5 no cargó (revisá la conexión)";
    console.error("ml5 no está disponible. Revisá el <script> del CDN en index.html.");
    return;
  }

  // MoveNet en modo una sola persona (más liviano que el multipersona).
  // flipped: true hace que ml5 devuelva las X ya invertidas, igual que el video en espejo.
  modeloCuerpo = ml5.bodyPose("MoveNet", {
    modelType: "SINGLEPOSE_LIGHTNING",
    flipped: true,
  });

  modeloCuerpo.ready
    .then(() => {
      conexionesCuerpo = modeloCuerpo.getSkeleton();
      iniciarCuerpo();
    })
    .catch((error) => {
      estadoCuerpo = "error";
      mensajeErrorCuerpo = "no se pudo cargar el modelo";
      console.error("Error al cargar bodyPose:", error);
    });

  // Manos: hasta 2, también con las X invertidas.
  modeloManos = ml5.handPose({ maxHands: 2, flipped: true });

  modeloManos.ready
    .then(() => {
      conexionesManos = modeloManos.getConnections();
      iniciarManos();
    })
    .catch((error) => {
      estadoManos = "error";
      mensajeErrorManos = "no se pudo cargar el modelo";
      console.error("Error al cargar handPose:", error);
    });
}

function iniciarCuerpo() {
  if (!captura || estadoCuerpo === "error") return;
  modeloCuerpo.detectStart(captura, (poses) => {
    posesDetectadas = poses;
  });
  estadoCuerpo = "activo";
}

function iniciarManos() {
  if (!captura || estadoManos === "error") return;
  modeloManos.detectStart(captura, (manos) => {
    manosDetectadas = manos;
  });
  estadoManos = "activo";
}

function alternarCuerpo() {
  if (estadoCuerpo === "activo") {
    modeloCuerpo.detectStop();
    estadoCuerpo = "listo";
    posesDetectadas = [];
  } else if (estadoCuerpo === "listo") {
    iniciarCuerpo();
  }
}

function alternarManos() {
  if (estadoManos === "activo") {
    modeloManos.detectStop();
    estadoManos = "listo";
    manosDetectadas = [];
  } else if (estadoManos === "listo") {
    iniciarManos();
  }
}

function keyPressed() {
  if (key === "b" || key === "B") alternarCuerpo();
  if (key === "h" || key === "H") alternarManos();
}

// --- Dibujo del video y de las detecciones ---

// Devuelve el cuadrado central que recortamos del video.
function recorteCuadrado() {
  const anchoVideo = captura.width;
  const altoVideo = captura.height;
  const lado = Math.min(anchoVideo, altoVideo);

  return {
    lado,
    x: (anchoVideo - lado) / 2,
    y: (altoVideo - lado) / 2,
  };
}

// Dibuja el video en espejo, como si fuera un reflejo.
// Recorta un cuadrado del centro para llenar el canvas sin deformarlo.
function dibujarCamaraEspejada() {
  const recorte = recorteCuadrado();

  push();
  translate(width, 0); // Movemos el origen al borde derecho
  scale(-1, 1); // Invertimos el eje X
  // image(imagen, xOrigen, yOrigen, anchoOrigen, altoOrigen, x, y, ancho, alto)
  image(
    captura,
    recorte.x,
    recorte.y,
    recorte.lado,
    recorte.lado,
    0,
    0,
    width,
    height
  );
  pop();
}

// Convierte un punto del video a coordenadas del canvas.
// ml5 ya invirtió la X (flipped: true), así que acá solo aplicamos
// el mismo recorte cuadrado y la misma escala que usa el video.
function aCanvas(x, y) {
  const recorte = recorteCuadrado();

  return {
    x: ((x - recorte.x) / recorte.lado) * width,
    y: ((y - recorte.y) / recorte.lado) * height,
  };
}

function dibujarCuerpo() {
  for (const pose of posesDetectadas) {
    // Pasamos todos los puntos a coordenadas del canvas una sola vez
    const puntos = pose.keypoints.map((keypoint) => aCanvas(keypoint.x, keypoint.y));

    // Esqueleto: líneas entre los pares de puntos conectados
    stroke(70, 220, 170, 220);
    strokeWeight(3);
    for (const [inicio, fin] of conexionesCuerpo) {
      if (
        pose.keypoints[inicio].confidence > CONFIANZA_MINIMA &&
        pose.keypoints[fin].confidence > CONFIANZA_MINIMA
      ) {
        line(
          puntos[inicio].x,
          puntos[inicio].y,
          puntos[fin].x,
          puntos[fin].y
        );
      }
    }

    // Puntos: un círculo por keypoint confiable
    noStroke();
    fill(130, 255, 200);
    for (let i = 0; i < pose.keypoints.length; i++) {
      if (pose.keypoints[i].confidence > CONFIANZA_MINIMA) {
        circle(puntos[i].x, puntos[i].y, 8);
      }
    }
  }
}

function dibujarManos() {
  for (const mano of manosDetectadas) {
    // Los keypoints de la mano no traen confianza propia: filtramos por la mano
    if (mano.confidence < CONFIANZA_MINIMA) continue;

    const puntos = mano.keypoints.map((keypoint) => aCanvas(keypoint.x, keypoint.y));

    // Conexiones entre los puntos de la mano
    stroke(255, 170, 60, 230);
    strokeWeight(2);
    for (const [inicio, fin] of conexionesManos) {
      line(
        puntos[inicio].x,
        puntos[inicio].y,
        puntos[fin].x,
        puntos[fin].y
      );
    }

    // Puntos de la mano
    noStroke();
    fill(255, 205, 90);
    for (const punto of puntos) {
      circle(punto.x, punto.y, 6);
    }
  }
}

// --- Interfaz de estado ---

function dibujarEstado() {
  const hayCamara = estadoCamara === "funcionando";
  const altoPanel = hayCamara ? 108 : 40;

  noStroke();
  fill(0, 0, 0, 175);
  rect(0, 0, width, altoPanel);

  textAlign(LEFT, CENTER);
  textSize(14);

  if (!hayCamara) {
    fill(255);
    text("Esperando permiso de cámara...", 16, 20);
    return;
  }

  dibujarLineaEstado(
    20,
    textoModelo("Cuerpo", estadoCuerpo, posesDetectadas.length, "persona(s)", mensajeErrorCuerpo),
    estadoCuerpo
  );
  dibujarLineaEstado(
    44,
    textoModelo("Manos", estadoManos, manosDetectadas.length, "mano(s)", mensajeErrorManos),
    estadoManos
  );

  fill(255);
  text("FPS: " + frameRate().toFixed(1), 16, 68);

  fill(180);
  text("B: cuerpo · H: manos", 16, 92);
}

function textoModelo(nombre, estado, cantidad, unidad, mensajeError) {
  if (estado === "error") return nombre + ": error · " + mensajeError;
  return nombre + ": " + estado + " · " + cantidad + " " + unidad;
}

function dibujarLineaEstado(y, texto, estado) {
  if (estado === "error") fill(255, 130, 130);
  else if (estado === "cargando") fill(255, 210, 120);
  else fill(255);

  text(texto, 16, y);
}

function dibujarPantallaError() {
  background(20);
  fill(255, 120, 120);
  textSize(20);
  textAlign(CENTER, CENTER);
  text(mensajeErrorCamara, width / 2, height / 2, width - 80, height - 80);
}

function mostrarErrorCamara(mensaje) {
  estadoCamara = "error";
  mensajeErrorCamara = mensaje;
  console.error(mensaje);
}

// Traduce el error del navegador a un mensaje entendible.
function describirErrorCamara(error) {
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
