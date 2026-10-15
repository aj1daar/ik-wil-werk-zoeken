// Clicking the toolbar icon opens the side panel. The manifest declaring a panel
// does not make it openable, and there is no popup, so this one call is what
// wires the icon to it.
//
// No state lives up here: a service worker is torn down after about thirty
// seconds of quiet, and anything held in a module variable goes with it.
async function openOnActionClick(): Promise<void> {
  try {
    // openPanelOnActionClick — the name with "Icon" in it does not exist and
    // throws synchronously, which kills the worker before it registers anything.
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  } catch (error) {
    console.error('Could not set the side panel to open on click', error)
  }
}

void openOnActionClick()
