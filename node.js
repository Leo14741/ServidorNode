const express = require('express');
const mysql = require('mysql2');
const cron = require('node-cron');
const path = require('path');
const bodyParser = require('body-parser');
const http = require('http');
const socketIO = require('socket.io');

const cors = require('cors');

const app = express();

app.use(cors());
// Middleware para controlar la solicitud OPTIONS
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        // Agregar los encabezados permitidos para la solicitud preflight
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(200).end();
    } else {
        next();
    }
});
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true
    }
});

// Configurar el middleware CORS para Socket.IO

// Variable global para controlar la ejecución de la función
let isTrackingRunning = false;
// Configurar el middleware body-parser
app.use(bodyParser.json());
// Configuración de la conexión a MySQL
let socketClient;
var tiempo;
var distanciaRecorrida = 0;
var distanciaTotalInicial = 0;
var tiempoTranscurrido = 0;

function sendPorcentajeRecorrido(porcentajeRecorrido) {
    // Emite el evento 'porcentajeRecorrido' a través de la conexión WebSocket
    if (socketClient) {
        socketClient.emit('porcentajeRecorrido', porcentajeRecorrido);
    }
}


function startTracking(ruta, tiempoStr, latitud, longitud) {
    tiempo = parseInt(tiempoStr); // Extrae el valor numérico de la cadena

    console.log(tiempo); // Imprime el tiempo en minutos
    console.log(ruta);

    console.log("Latitud: " + latitud + ", Longitud: " + longitud);


    var rutaOptimaCodificada = ruta; // Reemplaza con la ruta óptima codificada que tienes

    // Decodifica la representación codificada de la ruta óptima
    var coordenadas = decodePolyline(rutaOptimaCodificada);

    // Función para decodificar una cadena codificada en formato polyline
    function decodePolyline(encoded) {
        var index = 0;
        var len = encoded.length;
        var lat = 0;
        var lng = 0;
        var coordinates = [];

        while (index < len) {
            var b;
            var shift = 0;
            var result = 0;

            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);

            var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;

            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);

            var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            var latlng = [lat * 1e-5, lng * 1e-5];
            coordinates.push(latlng);
        }

        return coordinates;
    }

    console.log("coordinates: "+ coordenadas)


    var tiempoTotal = tiempo * 60; // Convierte el tiempo a segundos

    console.log("time: " + tiempoTotal)

    function calculateDistance(coordinates) {
        var distance = 0;

        for (var i = 0; i < coordinates.length - 1; i++) {
            var lat1 = coordinates[i][0];
            var lon1 = coordinates[i][1];
            var lat2 = coordinates[i + 1][0];
            var lon2 = coordinates[i + 1][1];

            var p = 0.017453292519943295;    // Math.PI / 180
            var c = Math.cos;
            var a = 0.5 - c((lat2 - lat1) * p) / 2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p)) / 2;
            var d = 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km

            distance += d;
        }

        return distance;
    }

    distanciaTotalInicial = calculateDistance(coordenadas); // Obtiene la distancia total de la ruta
    console.log("distancia: "+distanciaTotalInicial)

    var velocidad = distanciaTotalInicial / tiempoTotal; // Calcula la velocidad CONSTANTE necesaria para completar la ruta en el tiempo especificado
    console.log("velocidad: " +velocidad)
    var porcentajeRecorrido = 0;

    var interval = setInterval(function () {
        if (distanciaRecorrida >= distanciaTotalInicial) {
            setTimeout(function () {
                sendPorcentajeRecorrido(0);
            }, 60000); // 1 minuto en milisegundos

            clearInterval(interval); // Detiene la actualización cuando se ha completado la ruta
        } else {
            porcentajeRecorrido = distanciaRecorrida / distanciaTotalInicial;

            // Emite el evento 'porcentajeRecorrido' a través de la conexión WebSocket
            sendPorcentajeRecorrido(porcentajeRecorrido);

            distanciaRecorrida += velocidad;
            tiempoTranscurrido += 1000; // Intervalo de actualización en milisegundos
            console.log("tiempo: " + tiempoTranscurrido);
            console.log("tiempo: " + porcentajeRecorrido);
        }
    }, 1000); // Intervalo de actualización en milisegundos
}

io.on('connection', (socket) => {
    console.log('Cliente conectado');
    socketClient = socket;

    // Envía el valor inicial de porcentajeRecorrido al cliente cuando se conecte
    sendPorcentajeRecorrido(distanciaRecorrida / distanciaTotalInicial);
});
// Ruta para obtener la ruta y datos iniciales
// Ruta GET para obtener la ruta y datos iniciales
app.get('/clash', (req, res) => {
    try {
        if (!isTrackingRunning) {
            const latitud = parseFloat(req.query.latitud1);
            const longitud = parseFloat(req.query.longitud1);
            const ruta = req.query.rutaOptima;
            const tiempoStr = req.query.tiempoDemora;
            console.log("Ruta: "+ruta+" Tiempo: "+tiempoStr)
            var longitudActual,latitudActual,tiempo;

            // Lógica para obtener la ruta y datos iniciales

            // Define la tarea programada para ejecutarse cada segundo
                startTracking(ruta, tiempoStr,latitud, longitud);
                isTrackingRunning = true;
        }

        res.status(200).json({ message: 'Ruta obtenida' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la ruta' });
    }
});


// Puerto en el que se ejecutará el servidor
const port = 8082;

// Iniciar el servidor
server.listen(port, () => {
    console.log(`Servidor en ejecución en el puerto ${port}`);
});