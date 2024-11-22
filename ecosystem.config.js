module.exports = {
    apps: [
      {
        name: "web-service",
        script: "./web-service/server.js",
        watch: false
      },
      {
        name: "ocr-service",
        script: "./ocr-service/server.js",
        watch: false
      },
      {
        name: "translate-service",
        script: "./translate-service/server.js",
        watch: false
      },
      {
        name: "pdf-service",
        script: "./pdf-service/server.js", 
        watch: false
      }
    ]
};