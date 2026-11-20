/**
 * The About modal: version display and the viewport hide/show hand-off.
 *
 * Wires its own two buttons at import time; the markup is always present when this module runs.
 */

const aboutBtn = document.getElementById('about-btn') as HTMLButtonElement | null;
const aboutModal = document.getElementById('about_modal') as HTMLDialogElement | null;

if (aboutBtn && aboutModal) {
  aboutBtn.addEventListener('click', () => {
    window.electronAPI?.setViewportVisibility(false);
    aboutModal.showModal();
  });

  aboutModal.addEventListener('close', () => {
    window.electronAPI?.setViewportVisibility(true);
  });
}
