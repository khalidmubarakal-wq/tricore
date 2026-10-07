/**
 * Invoice attachments for financial claims (Supabase Storage bucket
 * `claim-attachments`): adds an upload field to the bundle's claim modal and
 * uploads the file before the claim is saved.
 *
 * NOTE: the uploaded path is exposed as `window._tcLastAttachment`, but the
 * compiled bundle does not read it yet, so it is not stored on the claim.
 */
import { SB_URL, SB_KEY } from './config.js';
import { freshToken, currentToken } from './supabase.js';
import { escapeHtml as h } from './dom.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

async function uploadClaimFile(userId, claimId, file) {
  if (!file || !userId) return { ok: false, err: 'No file selected.' };

  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, err: 'File too large. Max 10MB.' };

  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, err: 'Only PDF, JPG, PNG files allowed.' };

  const ext  = file.name.split('.').pop();
  const path = `${userId}/${claimId || 'temp'}/invoice.${ext}`;
  // Ensure fresh token for upload
  const token = await freshToken();

  try {
    // Upload to Supabase Storage
    const res = await fetch(
      `${SB_URL}/storage/v1/object/claim-attachments/${path}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || SB_KEY}`,
          'x-upsert': 'true',
        },
        body: file,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, err: err.error || err.message || 'Upload failed.' };
    }

    // Return the path (we store path, generate URL on demand)
    return { ok: true, path, fileName: file.name };
  } catch (e) {
    return { ok: false, err: e.message || 'Upload failed.' };
  }
}

// Get signed URL for a stored file
async function getClaimFileUrl(path) {
  const token = currentToken();
  try {
    const res = await fetch(
      `${SB_URL}/storage/v1/object/sign/claim-attachments/${path}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || SB_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return `${SB_URL}/storage/v1${data.signedURL}`;
  } catch (_) { return null; }
}

/** The open claim modal (its header mentions "Claim"), or null. */
function findClaimModalHeader() {
  return [...document.querySelectorAll('.modal-hd h2')].find(h => h.textContent.includes('Claim')) || null;
}

/** Inject the invoice upload field above the modal's save row (once per modal). */
function injectAttachmentSection() {
  // The claim modal: an xl modal titled "New Claim" / "Edit Claim".
  const modalHd = findClaimModalHeader();

  if (!modalHd) return;
  const modal = modalHd.closest('.modal-box');
  if (!modal || modal.querySelector('#tc-attach-section')) return;

  // Find the save button row
  const saveRow = modal.querySelector('div[style*="flex-end"]');
  if (!saveRow) return;

  // Create attachment section
  const section = document.createElement('div');
  section.id = 'tc-attach-section';
  section.style.cssText = 'border-top:1px solid #F1F5F9;padding-top:16px;margin-top:4px;';
  section.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-direction:row-reverse;direction:rtl;font-family:'Noto Sans Arabic',system-ui,sans-serif;">
      📎 مرفق الفاتورة <span style="font-weight:400;color:#94A3B8;">(PDF, JPG, PNG — بحد أقصى 10 ميغابايت)</span>
    </div>
    <div id="tc-attach-drop" style="border:2px dashed #E2E8F0;border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:all .15s;background:#F8FAFC;"
      onclick="document.getElementById('tc-attach-input').click()"
      ondragover="event.preventDefault();this.style.borderColor='#2563EB';this.style.background='#EFF6FF';"
      ondragleave="this.style.borderColor='#E2E8F0';this.style.background='#F8FAFC';"
      ondrop="event.preventDefault();this.style.borderColor='#E2E8F0';this.style.background='#F8FAFC';tcHandleDrop(event.dataTransfer.files[0])">
      <div id="tc-attach-label" style="color:#64748B;font-size:13px;font-family:'Noto Sans Arabic',system-ui,sans-serif;">
        <span style="font-size:20px;display:block;margin-bottom:6px;">📂</span>
        اضغط للتصفح أو اسحب وأفلت الملف هنا
      </div>
    </div>
    <input id="tc-attach-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none"
      onchange="tcHandleFileSelect(this.files[0])" />
    <div id="tc-attach-status" style="margin-top:8px;font-size:12px;color:#64748B;min-height:18px;text-align:right;direction:rtl;font-family:'Noto Sans Arabic',system-ui,sans-serif;"></div>`;

  saveRow.parentNode.insertBefore(section, saveRow);

  // Store file reference for when form saves
  window._tcPendingFile = null;
  window._tcPendingFileName = null;
}

function tcHandleFileSelect(file) {
  if (!file) return;
  const label = document.getElementById('tc-attach-label');
  const status = document.getElementById('tc-attach-status');
  if (label) label.innerHTML = `<span style="font-size:18px;display:block;margin-bottom:4px;">📄</span><strong style="color:#0F172A;">${h(file.name)}</strong><br/><span style="font-size:11px;color:#94A3B8;">${(file.size/1024).toFixed(0)} KB</span>`;
  if (status) { status.textContent = ''; status.style.color = '#64748B'; }
  window._tcPendingFile = file;
  window._tcPendingFileName = file.name;
}

/**
 * Wrap the claim modal's Save button: upload the pending file first, then
 * re-dispatch the click so React's own save handler runs.
 */
function patchClaimSave() {
  const modalHd = findClaimModalHeader();
  if (!modalHd) { window._tcPendingFile = null; return; }

  const modal = modalHd.closest('.modal-box');
  if (!modal || modal.dataset.tcPatched) return;
  modal.dataset.tcPatched = 'true';

  const saveBtn = [...modal.querySelectorAll('button.btn-p')]
    .find(b => b.textContent.trim() === 'Save');
  if (!saveBtn) return;

  saveBtn.onclick = null;
  let _isProcessing = false; // guard against re-entry
  saveBtn.addEventListener('click', async function(e) {
    if (_isProcessing) return; // prevent re-entry
    e.stopImmediatePropagation();
    const file = window._tcPendingFile;
    if (!file) {
      // No file — dispatch a synthetic click to let React's handler fire
      // (don't call saveBtn.click() — that would re-trigger our listener)
      _isProcessing = true;
      const syntheticClick = new MouseEvent('click', { bubbles: true, cancelable: true });
      saveBtn.dispatchEvent(syntheticClick);
      _isProcessing = false;
      return;
    }
    const status = document.getElementById('tc-attach-status');
    if (status) { status.textContent = 'جارٍ الرفع…'; status.style.color = '#2563EB'; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'جارٍ الحفظ…';

    const session = window._tcSession;
    const claimId = 'claim-' + Date.now();
    const result = await uploadClaimFile(session?.userId, claimId, file);

    if (!result.ok) {
      if (status) { status.textContent = result.err; status.style.color = '#DC2626'; }
      saveBtn.disabled = false;
      saveBtn.textContent = 'حفظ';
      return;
    }

    // Store attachment path in a way React can pick it up
    window._tcLastAttachment = { path: result.path, fileName: result.fileName };
    window._tcPendingFile = null;
    if (status) { status.textContent = '✓ تم الرفع: ' + result.fileName; status.style.color = '#059669'; }

    // Trigger React's save handler via a synthetic click (not saveBtn.click())
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
    _isProcessing = true;
    const reactTrigger = new MouseEvent('click', { bubbles: true, cancelable: true });
    saveBtn.dispatchEvent(reactTrigger);
    _isProcessing = false;
  }, true);
}

export function installClaimAttachments() {
  Object.assign(window, {
    _tcUploadClaimFile: uploadClaimFile,
    _tcGetClaimFileUrl: getClaimFileUrl,
    tcHandleFileSelect,
    tcHandleDrop: tcHandleFileSelect,
  });
  // One observer drives both steps, in order, on every React commit.
  setTimeout(() => {
    new MutationObserver(() => { injectAttachmentSection(); patchClaimSave(); })
      .observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  }, 1200);
}
