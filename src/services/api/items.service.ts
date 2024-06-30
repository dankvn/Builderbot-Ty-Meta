import axios from 'axios';



export const getItem = async () => {
  try {
    const response = await axios.get('https://api-catalogo-pdf.onrender.com/api/productos/');

    return response.data; // Esto devuelve los datos recibidos del servidor
  } catch (error) {
    console.error('Error al obtener productos:', error);
    throw error; // Puedes manejar el error según tus necesidades
  }
};


