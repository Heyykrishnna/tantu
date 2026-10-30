const forms = document.querySelectorAll("article form");

for (const form of forms) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const audience = values.get("audience");
    const excerptShared = values.get("share") === "on";
    const output = form.parentElement.querySelector("output");
    const sourceAccess = audience === "owner" ? "Private source visible to its owner." : "Private source unavailable to this audience.";
    const snapshot = excerptShared ? "The selected excerpt becomes a separate destination-governed copy after explicit review." : "No private excerpt is copied.";
    output.textContent = `${sourceAccess} ${snapshot} This preview performs no external action.`;
  });
}
