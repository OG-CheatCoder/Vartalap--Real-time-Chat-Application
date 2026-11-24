import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
export const SERVER_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  return `${SERVER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("vartalap_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Let browser attach proper multipart boundary when uploading FormData
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("vartalap_token");
      localStorage.removeItem("vartalap_user");
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
