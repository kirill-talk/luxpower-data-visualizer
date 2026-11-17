// API Base URL config:
// In local/docker environment, defaults to relative '/api'
// When hosted on GitHub Pages, can be pointed to a gateway URL (e.g. https://data-visualizer.kidev.uk/api)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
