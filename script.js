// Wait until the page markup is available before finding interactive controls.
document.addEventListener("DOMContentLoaded", () => {
  console.log("Page loaded");

  const menuToggle = document.getElementById("menu-toggle");

  // Toggle the existing mobile navigation when its hamburger button is clicked.
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });
  }
});
