
import fs from "fs/promises";
import Replicate from "replicate";
import cron from 'node-cron';



// Inicializa la instancia de Replicate utilizando la variable de entorno
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN, // Asegúrate de tener la variable de entorno configurada
  });
  
  /**
 * get calendar
 * @returns 
 */
  // Función para transcribir el archivo usando la API de Whisper en Replicate
  const transcribeAudio = async (filePath): Promise<any> => {
    try {
      const buffer = await fs.readFile(filePath, { encoding: "base64" }); // Convierte el archivo a base64
  
      // Configura el input para la API de Whisper
      const input = {
        audio: `data:audio/wav;base64,${buffer}`,
      };
  
      // Llama a la API de Replicate para transcribir el audio
      const output = await replicate.run(
        "openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2",
        { input }
      );
  
      console.log(
        `🤖 Full Transcription Result: ${JSON.stringify(output, null, 2)}`
      );
      return output; // Devuelve el resultado de la transcripción
    } catch (error) {
      console.error("Error transcribing audio:", error);
      return null;
    }
  };
  // Función para eliminar archivos temporales
  const deleteTemporaryFiles = async () => {
      const tempDir = './tmp';
      try {
          const files = await fs.readdir(tempDir);
          
          for (const file of files) {
              await fs.unlink(`${tempDir}/${file}`);
          }
          console.log('Archivos temporales eliminados.');
      } catch (error) {
          console.error('Error al eliminar archivos temporales:', error);
      }
  };
  
  // Programar una tarea que se ejecute a medianoche cada día
  cron.schedule('*/10 * * * *', async () => {
      console.log('Iniciando limpieza de archivos temporales...');
      await deleteTemporaryFiles();
  }, {
      scheduled: true,
      timezone: "America/Guayaquil" // Ajusta la zona horaria según tu ubicación
  });

  export {deleteTemporaryFiles,transcribeAudio}