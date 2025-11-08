const { contextBridge } = require("electron");

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    console.log("✅ script validated");
  });
}

contextBridge.exposeInMainWorld("bubblemarks", {
  version: require("./package.json").version,
});
