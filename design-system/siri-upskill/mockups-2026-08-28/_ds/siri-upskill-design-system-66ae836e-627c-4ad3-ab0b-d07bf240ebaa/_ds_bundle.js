/* @ds-bundle: {"format":4,"namespace":"SIRIUpSkillDesignSystem_66ae83","components":[{"name":"CourseCard","sourcePath":"components/catalog/CourseCard.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"Pagination","sourcePath":"components/navigation/Pagination.jsx"}],"sourceHashes":{"components/catalog/CourseCard.jsx":"0bdd04a58767","components/feedback/EmptyState.jsx":"3eb891267a69","components/feedback/Modal.jsx":"308ed4b914b0","components/feedback/Skeleton.jsx":"6e47b58506f1","components/feedback/Toast.jsx":"4f7859683989","components/forms/Button.jsx":"6f9a209a4139","components/forms/Checkbox.jsx":"5679e0743afa","components/forms/Input.jsx":"41acc15c0d6e","components/forms/Select.jsx":"4f0f19fc4edc","components/navigation/Breadcrumb.jsx":"2435231a9afa","components/navigation/Pagination.jsx":"18b2b6019903","ui_kits/web/CatalogScreen.jsx":"756852b861ef","ui_kits/web/CourseDetailScreen.jsx":"65f5b98a6ac3","ui_kits/web/HomeScreen.jsx":"66909d8afb21","ui_kits/web/LoginScreen.jsx":"24be2d88373c","ui_kits/web/Shell.jsx":"8970a1153e37","ui_kits/web/data.js":"a3a45d5aea99"},"inlinedExternals":[],"unexposedExports":[{"name":"ensureFieldCss","sourcePath":"components/forms/Input.jsx"}]} */

(() => {

const __ds_ns = (window.SIRIUpSkillDesignSystem_66ae83 = window.SIRIUpSkillDesignSystem_66ae83 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/catalog/CourseCard.jsx
try { (() => {
const css = `
.su-course-card{display:flex;height:100%;flex-direction:column;gap:8px;border-radius:var(--radius-lg);border:1px solid var(--color-border);background:var(--color-surface);padding:16px;text-decoration:none;transition:box-shadow .2s ease-out;font-family:var(--font-sans);box-sizing:border-box;cursor:pointer}
.su-course-card:hover{box-shadow:var(--shadow-md)}
.su-course-card:focus-visible{outline:none;box-shadow:0 0 0 2px var(--color-focus-ring)}
.su-course-thumb{position:relative;aspect-ratio:16/9;width:100%;overflow:hidden;border-radius:var(--radius-md);background:var(--color-surface-muted)}
.su-course-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.su-course-title{margin:0;font-size:16px;font-weight:600;color:var(--color-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.su-course-inst{margin:0;font-size:14px;color:var(--color-text-muted)}
.su-course-rating{display:inline-flex;align-items:center;gap:4px;margin:0;font-size:14px;color:var(--color-text)}
.su-course-rating i{color:var(--color-accent)}
.su-course-pricerow{margin-top:auto;display:flex;align-items:baseline;gap:8px}
.su-course-price{font-size:18px;font-weight:700;color:var(--color-primary)}
.su-course-compare{font-size:14px;color:var(--color-text-muted);text-decoration:line-through}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-course-css')) {
    const s = document.createElement('style');
    s.id = 'su-course-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
const thb = n => '฿' + Number(n).toLocaleString('th-TH');
function CourseCard({
  title,
  instructor,
  price,
  comparePrice,
  ratingAverage,
  ratingCount = 0,
  thumbnailUrl,
  href = '#',
  onClick
}) {
  ensureCss();
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onClick: onClick,
    className: "su-course-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "su-course-thumb"
  }, thumbnailUrl && /*#__PURE__*/React.createElement("img", {
    src: thumbnailUrl,
    alt: ""
  })), /*#__PURE__*/React.createElement("h3", {
    className: "su-course-title"
  }, title), /*#__PURE__*/React.createElement("p", {
    className: "su-course-inst"
  }, instructor), ratingCount > 0 && /*#__PURE__*/React.createElement("p", {
    className: "su-course-rating"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-star",
    "aria-hidden": "true"
  }), ratingAverage, " (", ratingCount.toLocaleString(), " \u0E23\u0E35\u0E27\u0E34\u0E27)"), /*#__PURE__*/React.createElement("div", {
    className: "su-course-pricerow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "su-course-price"
  }, thb(price)), comparePrice && /*#__PURE__*/React.createElement("span", {
    className: "su-course-compare"
  }, thb(comparePrice))));
}
Object.assign(__ds_scope, { CourseCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/catalog/CourseCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
const css = `
.su-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 24px;text-align:center;font-family:var(--font-sans)}
.su-empty-icon{display:flex;height:64px;width:64px;align-items:center;justify-content:center;border-radius:var(--radius-full);background:var(--color-surface-muted);color:var(--color-text-muted);font-size:32px}
.su-empty-h{margin:0;font-size:18px;font-weight:600;color:var(--color-text)}
.su-empty-d{margin:0;max-width:24rem;font-size:14px;color:var(--color-text-muted)}
.su-empty-a{margin-top:8px}
.su-empty-a:empty{margin-top:0}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-empty-css')) {
    const s = document.createElement('style');
    s.id = 'su-empty-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
function EmptyState({
  heading,
  description,
  icon,
  action
}) {
  ensureCss();
  return /*#__PURE__*/React.createElement("div", {
    className: "su-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "su-empty-icon"
  }, icon || /*#__PURE__*/React.createElement("i", {
    className: "ph ph-tray",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("h3", {
    className: "su-empty-h"
  }, heading), description && /*#__PURE__*/React.createElement("p", {
    className: "su-empty-d"
  }, description), /*#__PURE__*/React.createElement("div", {
    className: "su-empty-a"
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
const css = `
@keyframes su-modal-in{from{opacity:0;transform:translateY(8px) scale(.98)}}
@keyframes su-overlay-in{from{opacity:0}}
.su-modal-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgb(15 23 42 / 0.6);padding:16px;animation:su-overlay-in .2s ease-out}
.su-modal-panel{width:100%;max-width:32rem;border-radius:var(--radius-lg);background:var(--color-bg);padding:24px;box-shadow:var(--shadow-lg);animation:su-modal-in .2s ease-out;font-family:var(--font-sans);box-sizing:border-box}
.su-modal-head{margin-bottom:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.su-modal-title{margin:0;font-size:18px;font-weight:600;color:var(--color-text)}
.su-modal-x{display:flex;height:44px;width:44px;flex-shrink:0;cursor:pointer;align-items:center;justify-content:center;border-radius:var(--radius-md);border:none;background:none;color:var(--color-text-muted);transition:background-color .2s ease-out,color .2s ease-out;font-size:18px}
.su-modal-x:hover{background:var(--color-surface-muted);color:var(--color-text)}
.su-modal-x:focus-visible{outline:none;box-shadow:0 0 0 2px var(--color-focus-ring)}
.su-modal-body{color:var(--color-text);font-size:16px}
.su-modal-foot{margin-top:24px;display:flex;justify-content:flex-end;gap:12px}
.su-modal-foot:empty{margin-top:0}
@media (prefers-reduced-motion:reduce){.su-modal-overlay,.su-modal-panel{animation:none}}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-modal-css')) {
    const s = document.createElement('style');
    s.id = 'su-modal-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
function Modal({
  open = false,
  title,
  showCloseButton = true,
  onClose,
  footer,
  children
}) {
  ensureCss();
  React.useEffect(() => {
    if (!open) return;
    const h = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    role: "presentation",
    className: "su-modal-overlay",
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    className: "su-modal-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "su-modal-head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "su-modal-title"
  }, title), showCloseButton && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "\u0E1B\u0E34\u0E14",
    onClick: onClose,
    className: "su-modal-x"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-x",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "su-modal-body"
  }, children), /*#__PURE__*/React.createElement("div", {
    className: "su-modal-foot"
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
const css = `
.su-skel{position:relative;overflow:hidden;background:var(--color-surface-muted)}
.su-skel::after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgb(255 255 255 / 0.35),transparent);animation:su-skel-sweep 1.6s ease-in-out infinite}
@keyframes su-skel-sweep{100%{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){.su-skel::after{animation:none;display:none}}
.su-skel-col{display:flex;flex-direction:column;gap:8px}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-skel-css')) {
    const s = document.createElement('style');
    s.id = 'su-skel-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
function Skeleton({
  variant = 'block',
  width = '100%',
  height,
  lines = 3
}) {
  ensureCss();
  const h = height || (variant === 'text' ? '0.875rem' : '1rem');
  const r = variant === 'text' ? 'var(--radius-sm)' : 'var(--radius-md)';
  if (variant === 'text') {
    return /*#__PURE__*/React.createElement("div", {
      className: "su-skel-col"
    }, Array.from({
      length: lines
    }, (_, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "su-skel",
      style: {
        width: i === lines - 1 && lines > 1 ? '70%' : width,
        height: h,
        borderRadius: r
      }
    })));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "su-skel",
    style: {
      width,
      height: h,
      borderRadius: r
    }
  });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const css = `
.su-toast{pointer-events:auto;display:flex;width:100%;max-width:24rem;align-items:flex-start;gap:12px;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-bg);padding:16px;box-shadow:var(--shadow-lg);font-family:var(--font-sans);box-sizing:border-box}
.su-toast-icon{margin-top:2px;font-size:20px;flex-shrink:0}
.su-toast-msg{min-width:0;flex:1;padding:6px 0;margin:0;font-size:14px;color:var(--color-text)}
.su-toast-x{display:flex;height:44px;width:44px;flex-shrink:0;cursor:pointer;align-items:center;justify-content:center;border-radius:var(--radius-md);border:none;background:none;color:var(--color-text-muted);transition:background-color .2s ease-out,color .2s ease-out;font-size:16px}
.su-toast-x:hover{background:var(--color-surface-muted);color:var(--color-text)}
.su-toast-x:focus-visible{outline:none;box-shadow:0 0 0 2px var(--color-focus-ring)}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-toast-css')) {
    const s = document.createElement('style');
    s.id = 'su-toast-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
const ICONS = {
  success: ['ph-check-circle', 'var(--color-success)'],
  error: ['ph-x-circle', 'var(--color-danger)'],
  warning: ['ph-warning-circle', 'var(--color-warning)'],
  info: ['ph-info', 'var(--color-primary)']
};
function Toast({
  type = 'info',
  message,
  onDismiss
}) {
  ensureCss();
  const [icon, color] = ICONS[type] || ICONS.info;
  return /*#__PURE__*/React.createElement("div", {
    role: type === 'error' ? 'alert' : 'status',
    className: "su-toast"
  }, /*#__PURE__*/React.createElement("i", {
    "aria-hidden": "true",
    className: `ph ${icon} su-toast-icon`,
    style: {
      color
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "su-toast-msg"
  }, message), onDismiss && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "\u0E1B\u0E34\u0E14\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49",
    onClick: onDismiss,
    className: "su-toast-x"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-x",
    "aria-hidden": "true"
  })));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
const css = `
.su-btn{display:inline-flex;user-select:none;align-items:center;justify-content:center;border-radius:var(--radius-md);font-weight:500;font-family:var(--font-sans);transition:background-color .2s ease-out,color .2s ease-out;cursor:pointer;border:none;background:none}
.su-btn:disabled{cursor:not-allowed;opacity:.6}
.su-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--color-bg),0 0 0 4px var(--color-focus-ring)}
.su-btn-sm{height:44px;gap:6px;padding:0 12px;font-size:14px}
.su-btn-md{height:48px;gap:8px;padding:0 16px;font-size:16px}
.su-btn-lg{height:56px;gap:10px;padding:0 24px;font-size:16px}
.su-btn-primary{background:var(--color-primary);color:var(--color-primary-foreground)}
.su-btn-primary:hover:not(:disabled){background:var(--color-primary-hover)}
.su-btn-secondary{border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text)}
.su-btn-secondary:hover:not(:disabled){background:var(--color-surface-muted)}
.su-btn-danger{background:var(--color-danger);color:var(--color-primary-foreground)}
.su-btn-danger:hover:not(:disabled){filter:brightness(.9)}
.su-btn-ghost{background:transparent;color:var(--color-primary)}
.su-btn-ghost:hover:not(:disabled){background:var(--color-surface-muted)}
.su-btn-full{width:100%}
@keyframes su-btn-spin{to{transform:rotate(360deg)}}
.su-btn-spinner{animation:su-btn-spin .8s linear infinite;transform-origin:center}
@media (prefers-reduced-motion:reduce){.su-btn-spinner{animation-duration:2.4s}}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-btn-css')) {
    const s = document.createElement('style');
    s.id = 'su-btn-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  fullWidth = false,
  leading,
  trailing,
  onClick,
  children
}) {
  ensureCss();
  const inactive = disabled || loading;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: inactive,
    "aria-busy": loading || undefined,
    onClick: onClick,
    className: `su-btn su-btn-${size} su-btn-${variant}${fullWidth ? ' su-btn-full' : ''}`
  }, loading ? /*#__PURE__*/React.createElement("svg", {
    className: "su-btn-spinner",
    style: {
      height: '1.1em',
      width: '1.1em',
      flexShrink: 0
    },
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeDasharray: "42",
    strokeDashoffset: "32",
    opacity: "0.85"
  })) : leading, children, !loading && trailing);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
const css = `
.su-check{display:flex;align-items:flex-start;gap:10px;font-family:var(--font-sans)}
.su-check-hit{position:relative;display:flex;height:44px;width:44px;flex-shrink:0;align-items:center;justify-content:center}
.su-check-input{position:absolute;inset:0;height:100%;width:100%;cursor:pointer;appearance:none;margin:0}
.su-check-input:disabled{cursor:not-allowed}
.su-check-box{pointer-events:none;position:absolute;height:20px;width:20px;border-radius:var(--radius-sm);border:2px solid var(--color-border);background:var(--color-bg);transition:background-color .2s ease-out,border-color .2s ease-out;box-sizing:border-box}
.su-check-on .su-check-box{background:var(--color-primary);border-color:var(--color-primary)}
.su-check-dis .su-check-box{opacity:.6}
.su-check-glyph{pointer-events:none;position:absolute;color:var(--color-primary-foreground);font-size:14px;opacity:0;transition:opacity .15s}
.su-check-glyph-show{opacity:1}
.su-check-input:focus-visible~.su-check-focus{opacity:1}
.su-check-focus{pointer-events:none;position:absolute;height:20px;width:20px;border-radius:var(--radius-sm);box-shadow:0 0 0 2px var(--color-bg),0 0 0 4px var(--color-focus-ring);opacity:0;transition:opacity .15s}
.su-check-label{min-height:44px;cursor:pointer;user-select:none;padding:10px 0;font-size:14px;color:var(--color-text);box-sizing:border-box}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-check-css')) {
    const s = document.createElement('style');
    s.id = 'su-check-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
let nextId = 0;
function Checkbox({
  label,
  checked = false,
  indeterminate = false,
  disabled = false,
  required = false,
  onChange
}) {
  ensureCss();
  const id = React.useMemo(() => `su-check-${nextId++}`, []);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const on = checked || indeterminate;
  return /*#__PURE__*/React.createElement("div", {
    className: `su-check${on ? ' su-check-on' : ''}${disabled ? ' su-check-dis' : ''}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "su-check-hit"
  }, /*#__PURE__*/React.createElement("input", {
    ref: ref,
    type: "checkbox",
    id: id,
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    className: "su-check-input"
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "su-check-box"
  }), /*#__PURE__*/React.createElement("i", {
    "aria-hidden": "true",
    className: `ph-bold ph-check su-check-glyph${checked && !indeterminate ? ' su-check-glyph-show' : ''}`
  }), /*#__PURE__*/React.createElement("i", {
    "aria-hidden": "true",
    className: `ph-bold ph-minus su-check-glyph${indeterminate ? ' su-check-glyph-show' : ''}`
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "su-check-focus"
  })), /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "su-check-label"
  }, label, required && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: 'var(--color-danger)'
    }
  }, " *")));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
const css = `
.su-field-label{margin-bottom:6px;display:block;font-size:14px;font-weight:500;color:var(--color-text);font-family:var(--font-sans)}
.su-field-req{color:var(--color-danger)}
.su-input,.su-select{display:block;height:48px;width:100%;border-radius:var(--radius-md);border:1px solid var(--color-border);background:var(--color-bg);padding:0 14px;font-size:16px;color:var(--color-text);font-family:var(--font-sans);transition:border-color .2s ease-out;box-sizing:border-box}
.su-input::placeholder{color:var(--color-text-muted)}
.su-input:disabled,.su-select:disabled{cursor:not-allowed;background:var(--color-surface-muted);color:var(--color-text-muted)}
.su-input:focus-visible,.su-select:focus-visible{outline:none;border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-focus-ring)}
.su-input-error{border-color:var(--color-danger)}
.su-field-help{margin:6px 0 0;font-size:14px;color:var(--color-text-muted);font-family:var(--font-sans)}
.su-field-err{margin:6px 0 0;font-size:14px;color:var(--color-danger);font-family:var(--font-sans)}
.su-select{appearance:none;padding-right:40px}
.su-select-wrap{position:relative}
.su-select-caret{pointer-events:none;position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--color-text-muted)}`;
function ensureFieldCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-field-css')) {
    const s = document.createElement('style');
    s.id = 'su-field-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
let nextId = 0;
function Input({
  label,
  type = 'text',
  placeholder,
  helperText,
  errorMessage,
  required = false,
  disabled = false,
  value,
  onChange,
  autocomplete
}) {
  ensureFieldCss();
  const id = React.useMemo(() => `su-input-${nextId++}`, []);
  const hasError = !!errorMessage;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "su-field-label"
  }, label, required && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "su-field-req"
  }, " *")), /*#__PURE__*/React.createElement("input", {
    id: id,
    type: type,
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    required: required || undefined,
    "aria-invalid": hasError || undefined,
    autoComplete: autocomplete,
    onChange: e => onChange && onChange(e.target.value),
    className: `su-input${hasError ? ' su-input-error' : ''}`
  }), hasError ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "su-field-err"
  }, errorMessage) : helperText ? /*#__PURE__*/React.createElement("p", {
    className: "su-field-help"
  }, helperText) : null);
}
Object.assign(__ds_scope, { ensureFieldCss, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
let nextId = 0;
function Select({
  label,
  options = [],
  placeholder,
  helperText,
  errorMessage,
  required = false,
  disabled = false,
  value,
  onChange
}) {
  __ds_scope.ensureFieldCss();
  const id = React.useMemo(() => `su-select-${nextId++}`, []);
  const hasError = !!errorMessage;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "su-field-label"
  }, label, required && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "su-field-req"
  }, " *")), /*#__PURE__*/React.createElement("div", {
    className: "su-select-wrap"
  }, /*#__PURE__*/React.createElement("select", {
    id: id,
    value: value ?? '',
    disabled: disabled,
    "aria-invalid": hasError || undefined,
    onChange: e => onChange && onChange(e.target.value),
    className: `su-select${hasError ? ' su-input-error' : ''}`
  }, placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value,
    disabled: o.disabled || false
  }, o.label))), /*#__PURE__*/React.createElement("i", {
    className: "ph ph-caret-down su-select-caret",
    "aria-hidden": "true"
  })), hasError ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "su-field-err"
  }, errorMessage) : helperText ? /*#__PURE__*/React.createElement("p", {
    className: "su-field-help"
  }, helperText) : null);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
const css = `
.su-bc{overflow-x:auto;font-family:var(--font-sans)}
.su-bc ol{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:14px;list-style:none;margin:0;padding:0}
.su-bc li{display:flex;align-items:center;gap:6px}
.su-bc-link{color:var(--color-text-muted);text-decoration:none;text-underline-offset:2px;transition:color .2s ease-out;border-radius:var(--radius-sm)}
.su-bc-link:hover{color:var(--color-primary);text-decoration:underline}
.su-bc-link:focus-visible{outline:none;box-shadow:0 0 0 2px var(--color-focus-ring)}
.su-bc-plain{color:var(--color-text-muted)}
.su-bc-cur{font-weight:500;color:var(--color-text)}
.su-bc-sep{font-size:12px;flex-shrink:0;color:var(--color-text-muted)}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-bc-css')) {
    const s = document.createElement('style');
    s.id = 'su-bc-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
function Breadcrumb({
  items = []
}) {
  ensureCss();
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "\u0E40\u0E2A\u0E49\u0E19\u0E17\u0E32\u0E07\u0E19\u0E33\u0E17\u0E32\u0E07",
    className: "su-bc"
  }, /*#__PURE__*/React.createElement("ol", null, items.map((item, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement("li", {
      key: i
    }, !last && item.href ? /*#__PURE__*/React.createElement("a", {
      href: item.href,
      onClick: item.onClick,
      className: "su-bc-link"
    }, item.label) : !last ? /*#__PURE__*/React.createElement("span", {
      className: "su-bc-plain"
    }, item.label) : /*#__PURE__*/React.createElement("span", {
      "aria-current": "page",
      className: "su-bc-cur"
    }, item.label), !last && /*#__PURE__*/React.createElement("i", {
      className: "ph ph-caret-right su-bc-sep",
      "aria-hidden": "true"
    }));
  })));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Pagination.jsx
try { (() => {
const css = `
.su-pag{font-family:var(--font-sans)}
.su-pag ul{display:flex;align-items:center;gap:8px;list-style:none;margin:0;padding:0}
.su-pag-btn{display:flex;height:44px;width:44px;cursor:pointer;align-items:center;justify-content:center;border-radius:var(--radius-md);border:none;background:none;color:var(--color-text);font-size:14px;font-weight:500;font-family:var(--font-sans);transition:background-color .2s ease-out}
.su-pag-btn:hover:not(:disabled):not(.su-pag-cur){background:var(--color-surface-muted)}
.su-pag-btn:disabled{cursor:not-allowed;opacity:.4}
.su-pag-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--color-focus-ring)}
.su-pag-cur{background:var(--color-primary);color:var(--color-primary-foreground)}
.su-pag-ell{display:flex;height:44px;width:44px;align-items:center;justify-content:center;color:var(--color-text-muted)}`;
function ensureCss() {
  if (typeof document !== 'undefined' && !document.getElementById('su-pag-css')) {
    const s = document.createElement('style');
    s.id = 'su-pag-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}
function pageItems(current, total) {
  if (total <= 7) return Array.from({
    length: total
  }, (_, i) => i + 1);
  const items = [1];
  if (current > 3) items.push('ellipsis');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) items.push(p);
  if (current < total - 2) items.push('ellipsis');
  items.push(total);
  return items;
}
function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange
}) {
  ensureCss();
  const go = p => {
    if (onPageChange && p >= 1 && p <= totalPages) onPageChange(p);
  };
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "\u0E01\u0E32\u0E23\u0E41\u0E1A\u0E48\u0E07\u0E2B\u0E19\u0E49\u0E32",
    className: "su-pag"
  }, /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "su-pag-btn",
    disabled: currentPage <= 1,
    onClick: () => go(currentPage - 1),
    "aria-label": "\u0E2B\u0E19\u0E49\u0E32\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-caret-left",
    "aria-hidden": "true"
  }))), pageItems(currentPage, totalPages).map((item, i) => /*#__PURE__*/React.createElement("li", {
    key: item === 'ellipsis' ? `e${i}` : item
  }, item === 'ellipsis' ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    className: "su-pag-ell"
  }, "\u2026") : /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => go(item),
    "aria-current": item === currentPage ? 'page' : undefined,
    className: `su-pag-btn${item === currentPage ? ' su-pag-cur' : ''}`
  }, item))), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "su-pag-btn",
    disabled: currentPage >= totalPages,
    onClick: () => go(currentPage + 1),
    "aria-label": "\u0E2B\u0E19\u0E49\u0E32\u0E16\u0E31\u0E14\u0E44\u0E1B"
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-caret-right",
    "aria-hidden": "true"
  })))));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Pagination.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/CatalogScreen.jsx
try { (() => {
const DS = window.SIRIUpSkillDesignSystem_66ae83;
function CatalogScreen({
  nav,
  initialCat
}) {
  const D = window.SU_DATA;
  const [cat, setCat] = React.useState(initialCat || null);
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState('relevance');
  const [level, setLevel] = React.useState('');
  const [page, setPage] = React.useState(1);
  let items = D.courses.filter(c => (!cat || c.cat === cat) && (!q || c.title.toLowerCase().includes(q.toLowerCase())) && (!level || c.level === level));
  if (sort === 'priceAsc') items = [...items].sort((a, b) => a.price - b.price);
  if (sort === 'priceDesc') items = [...items].sort((a, b) => b.price - a.price);
  if (sort === 'rating') items = [...items].sort((a, b) => b.rating - a.rating);
  const catBtn = active => ({
    display: 'flex',
    minHeight: 44,
    width: '100%',
    alignItems: 'center',
    borderRadius: 'var(--radius-md)',
    padding: '0 12px',
    textAlign: 'left',
    fontSize: 14,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-primary)' : 'var(--color-text)'
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: '72rem',
      padding: '32px 16px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, "\u0E40\u0E23\u0E35\u0E22\u0E19\u0E23\u0E39\u0E49\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14"), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => e.preventDefault(),
    style: {
      marginTop: 16,
      display: 'flex',
      maxWidth: '36rem',
      gap: 8,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(DS.Input, {
    label: "\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E04\u0E2D\u0E23\u0E4C\u0E2A",
    type: "search",
    placeholder: "\u0E2D\u0E22\u0E32\u0E01\u0E40\u0E23\u0E35\u0E22\u0E19\u0E2D\u0E30\u0E44\u0E23?",
    value: q,
    onChange: v => {
      setQ(v);
      setPage(1);
    }
  })), /*#__PURE__*/React.createElement(DS.Button, {
    type: "submit"
  }, "\u0E04\u0E49\u0E19\u0E2B\u0E32")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: 'grid',
      gridTemplateColumns: '16rem 1fr',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 12px',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)'
    }
  }, "\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: catBtn(!cat),
    onClick: () => setCat(null)
  }, "\u0E17\u0E38\u0E01\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48"), D.categories.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.slug,
    style: catBtn(cat === c.slug),
    onClick: () => {
      setCat(cat === c.slug ? null : c.slug);
      setPage(1);
    }
  }, c.th)))), /*#__PURE__*/React.createElement(DS.Select, {
    label: "\u0E23\u0E30\u0E14\u0E31\u0E1A",
    value: level,
    onChange: setLevel,
    options: [{
      value: '',
      label: 'ทุกระดับ'
    }, {
      value: 'เริ่มต้น',
      label: 'เริ่มต้น'
    }, {
      value: 'ปานกลาง',
      label: 'ปานกลาง'
    }, {
      value: 'ทุกระดับ',
      label: 'เหมาะกับทุกระดับ'
    }]
  }), /*#__PURE__*/React.createElement(DS.Select, {
    label: "\u0E04\u0E30\u0E41\u0E19\u0E19\u0E23\u0E35\u0E27\u0E34\u0E27",
    options: [{
      value: '',
      label: 'ทุกคะแนน'
    }, {
      value: '4',
      label: '4 ดาวขึ้นไป'
    }, {
      value: '3',
      label: '3 ดาวขึ้นไป'
    }]
  }), (cat || q || level) && /*#__PURE__*/React.createElement(DS.Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => {
      setCat(null);
      setQ('');
      setLevel('');
    }
  }, "\u0E25\u0E49\u0E32\u0E07\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, "\u0E1E\u0E1A ", items.length, " \u0E04\u0E2D\u0E23\u0E4C\u0E2A"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '12rem'
    }
  }, /*#__PURE__*/React.createElement(DS.Select, {
    label: "\u0E40\u0E23\u0E35\u0E22\u0E07\u0E15\u0E32\u0E21",
    value: sort,
    onChange: setSort,
    options: [{
      value: 'relevance',
      label: 'ความเกี่ยวข้อง'
    }, {
      value: 'rating',
      label: 'คะแนนสูงสุด'
    }, {
      value: 'priceAsc',
      label: 'ราคา: ต่ำไปสูง'
    }, {
      value: 'priceDesc',
      label: 'ราคา: สูงไปต่ำ'
    }]
  }))), items.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)'
    }
  }, /*#__PURE__*/React.createElement(DS.EmptyState, {
    heading: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07",
    description: "\u0E25\u0E2D\u0E07\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E04\u0E33\u0E04\u0E49\u0E19\u0E2B\u0E32 \u0E2B\u0E23\u0E37\u0E2D\u0E25\u0E49\u0E32\u0E07\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    action: /*#__PURE__*/React.createElement(DS.Button, {
      variant: "ghost",
      size: "sm",
      onClick: () => {
        setCat(null);
        setQ('');
        setLevel('');
      }
    }, "\u0E25\u0E49\u0E32\u0E07\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14")
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(CourseGrid, {
    courses: items,
    nav: nav,
    cols: 3
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 32
    }
  }, /*#__PURE__*/React.createElement(DS.Pagination, {
    currentPage: page,
    totalPages: 3,
    onPageChange: setPage
  }))))));
}
Object.assign(window, {
  CatalogScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/CatalogScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/CourseDetailScreen.jsx
try { (() => {
const DS = window.SIRIUpSkillDesignSystem_66ae83;
function CourseDetailScreen({
  nav,
  id
}) {
  const D = window.SU_DATA;
  const c = D.courses.find(x => x.id === id) || D.courses[0];
  const catName = D.categories.find(k => k.slug === c.cat).th;
  const sections = c.sections || [{
    name: 'ปูพื้นฐานและภาพรวม',
    count: Math.ceil(c.lessons * 0.15),
    free: true
  }, {
    name: 'เนื้อหาหลัก ภาคทฤษฎี',
    count: Math.ceil(c.lessons * 0.3)
  }, {
    name: 'ลงมือทำจริง ทีละขั้นตอน',
    count: Math.ceil(c.lessons * 0.35)
  }, {
    name: 'สรุปและต่อยอด',
    count: c.lessons - Math.ceil(c.lessons * 0.15) - Math.ceil(c.lessons * 0.3) - Math.ceil(c.lessons * 0.35)
  }];
  const outcomes = c.outcomes || ['เข้าใจหลักการสำคัญของเนื้อหาคอร์สอย่างเป็นระบบ', 'นำความรู้ไปประยุกต์ใช้กับงานจริงได้ทันที', 'ฝึกปฏิบัติผ่านตัวอย่างและแบบฝึกหัดจริง', 'ได้แนวทางต่อยอดการเรียนรู้ด้วยตัวเอง'];
  const requirements = c.requirements || ['ไม่ต้องมีพื้นฐานมาก่อน เริ่มจากศูนย์ได้', 'คอมพิวเตอร์หรือมือถือที่เชื่อมต่ออินเทอร์เน็ต'];
  const desc = c.desc || 'คอร์สนี้พาคุณเรียนรู้ตั้งแต่พื้นฐานจนใช้งานได้จริง สอนโดย ' + c.instructor + ' พร้อมตัวอย่างและแบบฝึกหัดจากงานจริง';
  const [openSec, setOpenSec] = React.useState(0);
  const [buyOpen, setBuyOpen] = React.useState(false);
  const h3s = {
    margin: '0 0 12px',
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-text)'
  };
  const box = {
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    padding: 24
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 auto',
      maxWidth: '72rem',
      padding: '32px 16px'
    }
  }, /*#__PURE__*/React.createElement(DS.Breadcrumb, {
    items: [{
      label: 'หน้าแรก',
      onClick: e => {
        e.preventDefault();
        nav('home');
      },
      href: '#'
    }, {
      label: catName,
      onClick: e => {
        e.preventDefault();
        nav('catalog', {
          cat: c.cat
        });
      },
      href: '#'
    }, {
      label: c.title
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: 'grid',
      gridTemplateColumns: '1fr 22rem',
      gap: 32,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 8px',
      fontSize: 32,
      fontWeight: 700,
      color: 'var(--color-text)',
      lineHeight: 1.25
    }
  }, c.title), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 12px',
      fontSize: 16,
      color: 'var(--color-text-muted)'
    }
  }, desc), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 16,
      fontSize: 14,
      color: 'var(--color-text)'
    }
  }, c.count > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-star",
    style: {
      color: 'var(--color-accent)'
    }
  }), c.rating, " (", c.count, " \u0E23\u0E35\u0E27\u0E34\u0E27)"), /*#__PURE__*/React.createElement("span", null, (c.count * 7 + 45).toLocaleString(), " \u0E04\u0E19\u0E40\u0E23\u0E35\u0E22\u0E19\u0E41\u0E25\u0E49\u0E27"), /*#__PURE__*/React.createElement("span", null, "\u0E23\u0E30\u0E14\u0E31\u0E1A: ", c.level), /*#__PURE__*/React.createElement("span", null, "\u0E20\u0E32\u0E29\u0E32: \u0E44\u0E17\u0E22")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 0',
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, "\u0E1C\u0E39\u0E49\u0E2A\u0E2D\u0E19: ", /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontWeight: 500
    }
  }, c.instructor))), /*#__PURE__*/React.createElement("section", {
    style: box
  }, /*#__PURE__*/React.createElement("h3", {
    style: h3s
  }, "\u0E2A\u0E34\u0E48\u0E07\u0E17\u0E35\u0E48\u0E08\u0E30\u0E44\u0E14\u0E49\u0E40\u0E23\u0E35\u0E22\u0E19\u0E23\u0E39\u0E49"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, outcomes.map(o => /*#__PURE__*/React.createElement("div", {
    key: o,
    style: {
      display: 'flex',
      gap: 8,
      fontSize: 14,
      color: 'var(--color-text)'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-check",
    style: {
      color: 'var(--color-success)',
      marginTop: 2
    }
  }), o)))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h3", {
    style: h3s
  }, "\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E04\u0E2D\u0E23\u0E4C\u0E2A"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 12px',
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, sections.length, " \u0E2B\u0E21\u0E27\u0E14 \xB7 ", c.lessons, " \u0E1A\u0E17\u0E40\u0E23\u0E35\u0E22\u0E19 \xB7 ", c.hours, " \u0E0A\u0E21. ", c.minutes, " \u0E19\u0E32\u0E17\u0E35"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }
  }, sections.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.name,
    style: {
      borderTop: i ? '1px solid var(--color-border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpenSec(openSec === i ? -1 : i),
    style: {
      display: 'flex',
      width: '100%',
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '0 16px',
      background: 'var(--color-surface)',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph ph-caret-${openSec === i ? 'up' : 'down'}`
  }), s.name, s.free && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-accent)',
      border: '1px solid var(--color-accent)',
      borderRadius: 'var(--radius-full)',
      padding: '1px 8px'
    }
  }, "\u0E14\u0E39\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E1F\u0E23\u0E35")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      color: 'var(--color-text-muted)',
      whiteSpace: 'nowrap',
      flexShrink: 0
    }
  }, s.count, " \u0E1A\u0E17")), openSec === i && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-bg)',
      padding: '8px 16px 16px'
    }
  }, Array.from({
    length: Math.min(s.count, 4)
  }, (_, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      display: 'flex',
      minHeight: 40,
      alignItems: 'center',
      gap: 8,
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-play-circle"
  }), "\u0E1A\u0E17\u0E17\u0E35\u0E48 ", j + 1, " \xB7 12 \u0E19\u0E32\u0E17\u0E35")), s.count > 4 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      paddingLeft: 24
    }
  }, "\u2026 \u0E2D\u0E35\u0E01 ", s.count - 4, " \u0E1A\u0E17")))))), /*#__PURE__*/React.createElement("section", {
    style: box
  }, /*#__PURE__*/React.createElement("h3", {
    style: h3s
  }, "\u0E2A\u0E34\u0E48\u0E07\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E01\u0E48\u0E2D\u0E19\u0E40\u0E23\u0E35\u0E22\u0E19"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontSize: 14,
      color: 'var(--color-text)'
    }
  }, requirements.map(r => /*#__PURE__*/React.createElement("li", {
    key: r
  }, r)))), /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h3", {
    style: h3s
  }, "\u0E23\u0E35\u0E27\u0E34\u0E27"), c.count === 0 ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E35\u0E27\u0E34\u0E27\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E19\u0E35\u0E49") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, [['คุณเมษา', 'คอร์สอธิบายเข้าใจง่ายมาก ผู้สอนตอบคำถามเร็ว', 5], ['คุณบดินทร์', 'เนื้อหาครบ นำไปใช้กับงานจริงได้เลย', 4]].map(([n, t, r]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      ...box,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)'
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 2,
      color: 'var(--color-accent)'
    }
  }, Array.from({
    length: r
  }, (_, i) => /*#__PURE__*/React.createElement("i", {
    key: i,
    className: "ph-fill ph-star",
    style: {
      fontSize: 13
    }
  })))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, t)))))), /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'sticky',
      top: 80,
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-bg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '16/9',
      position: 'relative'
    }
  }, thumbFor(c)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      color: 'var(--color-primary)'
    }
  }, "\u0E3F", c.price.toLocaleString()), c.comparePrice && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      color: 'var(--color-text-muted)',
      textDecoration: 'line-through'
    }
  }, "\u0E3F", c.comparePrice.toLocaleString())), /*#__PURE__*/React.createElement(DS.Button, {
    fullWidth: true,
    size: "lg",
    onClick: () => setBuyOpen(true)
  }, "\u0E0B\u0E37\u0E49\u0E2D\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E19\u0E35\u0E49"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-play-circle"
  }), c.lessons, " \u0E1A\u0E17\u0E40\u0E23\u0E35\u0E22\u0E19 \xB7 ", c.hours, " \u0E0A\u0E21. ", c.minutes, " \u0E19\u0E32\u0E17\u0E35"), /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-infinity"
  }), "\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E44\u0E14\u0E49\u0E15\u0E25\u0E2D\u0E14\u0E0A\u0E35\u0E1E"), /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-certificate",
    style: {
      color: 'var(--color-accent)'
    }
  }), "\u0E43\u0E1A\u0E1B\u0E23\u0E30\u0E01\u0E32\u0E28\u0E19\u0E35\u0E22\u0E1A\u0E31\u0E15\u0E23\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E40\u0E23\u0E35\u0E22\u0E19\u0E08\u0E1A"), /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph ph-device-mobile"
  }), "\u0E40\u0E23\u0E35\u0E22\u0E19\u0E44\u0E14\u0E49\u0E17\u0E38\u0E01\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C"))))), /*#__PURE__*/React.createElement(DS.Modal, {
    open: buyOpen,
    title: "\u0E0B\u0E37\u0E49\u0E2D\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E19\u0E35\u0E49",
    onClose: () => setBuyOpen(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(DS.Button, {
      variant: "secondary",
      onClick: () => setBuyOpen(false)
    }, "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01"), /*#__PURE__*/React.createElement(DS.Button, {
      onClick: () => setBuyOpen(false)
    }, "\u0E23\u0E31\u0E1A\u0E17\u0E23\u0E32\u0E1A"))
  }, "\u0E23\u0E30\u0E1A\u0E1A\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E08\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E2B\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E40\u0E23\u0E47\u0E27 \u0E46 \u0E19\u0E35\u0E49 (QR PromptPay, \u0E1A\u0E31\u0E15\u0E23\u0E40\u0E04\u0E23\u0E14\u0E34\u0E15 \u0E41\u0E25\u0E30\u0E1C\u0E48\u0E2D\u0E19\u0E0A\u0E33\u0E23\u0E30)"));
}
Object.assign(window, {
  CourseDetailScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/CourseDetailScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/HomeScreen.jsx
try { (() => {
const DS = window.SIRIUpSkillDesignSystem_66ae83;
function thumbFor(c) {
  const hues = {
    coding: '#db2777',
    marketing: '#b45309',
    finance: '#16a34a'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-surface-muted)'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph ${window.SU_DATA.categories.find(k => k.slug === c.cat).icon}`,
    style: {
      fontSize: 36,
      color: hues[c.cat],
      opacity: .55
    }
  }));
}
function CourseGrid({
  courses,
  nav,
  cols = 4
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols},1fr)`,
      gap: 24
    }
  }, courses.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(DS.CourseCard, {
    title: c.title,
    instructor: c.instructor,
    price: c.price,
    comparePrice: c.comparePrice,
    ratingAverage: c.rating,
    ratingCount: c.count,
    href: "#",
    onClick: e => {
      e.preventDefault();
      nav('course', {
        id: c.id
      });
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      left: 16,
      right: 16,
      aspectRatio: '16/9',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      pointerEvents: 'none'
    }
  }, thumbFor(c)))));
}
function SectionHead({
  title,
  onViewAll
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, title), /*#__PURE__*/React.createElement("a", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-primary)',
      cursor: 'pointer',
      textDecoration: 'none'
    },
    onClick: onViewAll
  }, "\u0E14\u0E39\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14 ", /*#__PURE__*/React.createElement("i", {
    className: "ph ph-arrow-right"
  })));
}
function HomeScreen({
  nav
}) {
  const D = window.SU_DATA;
  const recommended = [...D.courses].filter(c => c.count > 0).sort((a, b) => b.rating - a.rating).slice(0, 4);
  const newest = [...D.courses].slice(-4).reverse();
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '50vh',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      padding: '64px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 44,
      fontWeight: 700,
      color: 'var(--color-text)',
      lineHeight: 1.2
    }
  }, "\u0E40\u0E23\u0E35\u0E22\u0E19\u0E23\u0E39\u0E49\u0E17\u0E31\u0E01\u0E29\u0E30\u0E43\u0E2B\u0E21\u0E48 \u0E15\u0E48\u0E2D\u0E22\u0E2D\u0E14\u0E2A\u0E32\u0E22\u0E2D\u0E32\u0E0A\u0E35\u0E1E\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: '36rem',
      fontSize: 18,
      color: 'var(--color-text-muted)'
    }
  }, "\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E2D\u0E2D\u0E19\u0E44\u0E25\u0E19\u0E4C\u0E04\u0E38\u0E13\u0E20\u0E32\u0E1E\u0E08\u0E32\u0E01\u0E1C\u0E39\u0E49\u0E2A\u0E2D\u0E19\u0E15\u0E31\u0E27\u0E08\u0E23\u0E34\u0E07 \u0E40\u0E23\u0E35\u0E22\u0E19\u0E44\u0E14\u0E49\u0E17\u0E38\u0E01\u0E17\u0E35\u0E48\u0E17\u0E38\u0E01\u0E40\u0E27\u0E25\u0E32"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(DS.Button, {
    size: "lg",
    onClick: () => nav('login')
  }, "\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19"), /*#__PURE__*/React.createElement(DS.Button, {
    size: "lg",
    variant: "secondary",
    onClick: () => nav('login')
  }, "\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A"))), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: '0 auto',
      maxWidth: '72rem',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 24px',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, "\u0E40\u0E23\u0E35\u0E22\u0E19\u0E23\u0E39\u0E49\u0E15\u0E32\u0E21\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 16
    }
  }, D.categories.map(c => /*#__PURE__*/React.createElement("a", {
    key: c.slug,
    onClick: () => nav('catalog', {
      cat: c.slug
    }),
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      padding: 24,
      textAlign: 'center',
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'box-shadow .2s ease-out'
    },
    onMouseEnter: e => e.currentTarget.style.boxShadow = 'var(--shadow-md)',
    onMouseLeave: e => e.currentTarget.style.boxShadow = 'none'
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph ${c.icon}`,
    style: {
      fontSize: 32,
      color: 'var(--color-primary)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      color: 'var(--color-text)'
    }
  }, c.th))))), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: '0 auto',
      maxWidth: '72rem',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement(SectionHead, {
    title: "\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E41\u0E19\u0E30\u0E19\u0E33",
    onViewAll: () => nav('catalog')
  }), /*#__PURE__*/React.createElement(CourseGrid, {
    courses: recommended,
    nav: nav
  })), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: '0 auto',
      maxWidth: '72rem',
      padding: '48px 16px'
    }
  }, /*#__PURE__*/React.createElement(SectionHead, {
    title: "\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E43\u0E2B\u0E21\u0E48\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14",
    onViewAll: () => nav('catalog')
  }), /*#__PURE__*/React.createElement(CourseGrid, {
    courses: newest,
    nav: nav
  })));
}
Object.assign(window, {
  HomeScreen,
  CourseGrid,
  thumbFor
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/LoginScreen.jsx
try { (() => {
const DS = window.SIRIUpSkillDesignSystem_66ae83;
function LoginScreen({
  nav,
  onLogin
}) {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [name, setName] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const submit = () => {
    if (!email.includes('@')) {
      setErr('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    if (pw.length < 8) {
      setErr(null);
      return void setErr2(true);
    }
    setErr(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 700);
  };
  const [err2, setErr2] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '64px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: '26rem',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-bg)',
      padding: 32,
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '0 0 4px',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีของคุณ'), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 24px',
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, mode === 'login' ? 'ยินดีต้อนรับกลับมา' : 'เรียนรู้ทักษะใหม่จากผู้สอนตัวจริง'), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      submit();
    },
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, mode === 'register' && /*#__PURE__*/React.createElement(DS.Input, {
    label: "\u0E0A\u0E37\u0E48\u0E2D\u0E17\u0E35\u0E48\u0E41\u0E2A\u0E14\u0E07",
    value: name,
    onChange: setName,
    required: true
  }), /*#__PURE__*/React.createElement(DS.Input, {
    label: "\u0E2D\u0E35\u0E40\u0E21\u0E25",
    type: "email",
    value: email,
    onChange: setEmail,
    errorMessage: err,
    required: true,
    autocomplete: "email"
  }), /*#__PURE__*/React.createElement(DS.Input, {
    label: "\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19",
    type: "password",
    value: pw,
    onChange: setPw,
    required: true,
    helperText: err2 ? undefined : 'อย่างน้อย 8 ตัวอักษร',
    errorMessage: err2 ? 'ต้องมีความยาวอย่างน้อย 8 ตัวอักษร' : undefined
  }), /*#__PURE__*/React.createElement(DS.Button, {
    type: "submit",
    fullWidth: true,
    loading: loading
  }, loading ? mode === 'login' ? 'กำลังเข้าสู่ระบบ...' : 'กำลังสร้างบัญชี...' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี')), mode === 'login' && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      fontSize: 14
    }
  }, "\u0E25\u0E37\u0E21\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19?")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      textAlign: 'center',
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, mode === 'login' ? 'ยังไม่มีบัญชี? ' : 'มีบัญชีอยู่แล้ว? ', /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      setMode(mode === 'login' ? 'register' : 'login');
      setErr(null);
      setErr2(false);
    },
    style: {
      fontWeight: 500
    }
  }, mode === 'login' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'))));
}
Object.assign(window, {
  LoginScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/Shell.jsx
try { (() => {
const DS = window.SIRIUpSkillDesignSystem_66ae83;
const shellCss = `
.suk-header{position:sticky;top:0;z-index:30;height:64px;border-bottom:1px solid var(--color-border);background:var(--color-bg)}
.suk-header-in{margin:0 auto;display:flex;height:100%;max-width:72rem;align-items:center;justify-content:space-between;gap:16px;padding:0 16px}
.suk-brand{font-size:18px;font-weight:700;color:var(--color-primary);text-decoration:none;cursor:pointer}
.suk-nav{display:flex;align-items:center;gap:24px}
.suk-navlink{display:flex;min-height:44px;align-items:center;gap:6px;font-size:14px;font-weight:500;color:var(--color-text);text-decoration:none;cursor:pointer;background:none;border:none;font-family:var(--font-sans);transition:color .2s ease-out}
.suk-navlink:hover,.suk-navlink.active{color:var(--color-primary)}
.suk-lang{display:flex;align-items:center;gap:4px;border-right:1px solid var(--color-border);padding-right:12px}
.suk-lang button{display:flex;min-height:44px;align-items:center;border-radius:var(--radius-md);padding:0 8px;font-size:14px;color:var(--color-text);background:none;border:none;cursor:pointer;font-family:var(--font-sans)}
.suk-lang button:hover{background:var(--color-surface-muted)}
.suk-lang .cur{font-weight:600}
.suk-mega{position:absolute;left:0;top:100%;z-index:50;margin-top:8px;width:max-content;min-width:36rem;border-radius:var(--radius-lg);border:1px solid var(--color-border);background:var(--color-surface);padding:24px;box-shadow:var(--shadow-lg)}
.suk-mega-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}
.suk-mega a{display:flex;min-height:32px;align-items:center;gap:8px;font-size:14px;color:var(--color-text-muted);text-decoration:none;cursor:pointer}
.suk-mega a:hover{color:var(--color-primary)}
.suk-mega .head{font-weight:600;color:var(--color-text)}
.suk-mega .head i{color:var(--color-primary)}
.suk-footer{border-top:1px solid var(--color-border);background:var(--color-surface);margin-top:48px}
.suk-footer-in{margin:0 auto;display:flex;max-width:72rem;flex-direction:column;align-items:center;gap:8px;padding:32px 16px;text-align:center}`;
if (!document.getElementById('suk-shell-css')) {
  const s = document.createElement('style');
  s.id = 'suk-shell-css';
  s.textContent = shellCss;
  document.head.appendChild(s);
}
function SiteHeader({
  nav,
  route,
  authed,
  onSignOut
}) {
  const [mega, setMega] = React.useState(false);
  const [lang, setLang] = React.useState('th');
  const [theme, setTheme] = React.useState(document.documentElement.dataset.theme || 'light');
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('su-theme', next);
    } catch (e) {}
    setTheme(next);
  };
  return /*#__PURE__*/React.createElement("header", {
    className: "suk-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "suk-header-in"
  }, /*#__PURE__*/React.createElement("a", {
    className: "suk-brand",
    onClick: () => nav('home')
  }, "SIRI UpSkill"), /*#__PURE__*/React.createElement("nav", {
    className: "suk-nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: `suk-navlink${route === 'home' ? ' active' : ''}`,
    onClick: () => nav('home')
  }, "\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "suk-navlink",
    onClick: () => setMega(!mega)
  }, "\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 ", /*#__PURE__*/React.createElement("i", {
    className: "ph ph-caret-down",
    style: {
      transition: 'transform .2s ease-out',
      transform: mega ? 'rotate(180deg)' : 'none'
    }
  })), mega && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 40
    },
    onClick: () => setMega(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "suk-mega"
  }, /*#__PURE__*/React.createElement("div", {
    className: "suk-mega-grid"
  }, window.SU_DATA.categories.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.slug,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("a", {
    className: "head",
    onClick: () => {
      setMega(false);
      nav('catalog', {
        cat: c.slug
      });
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph ${c.icon}`
  }), c.th), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      paddingLeft: 24
    }
  }, c.children.map(ch => /*#__PURE__*/React.createElement("a", {
    key: ch,
    onClick: () => {
      setMega(false);
      nav('catalog', {
        cat: c.slug
      });
    }
  }, ch)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      borderTop: '1px solid var(--color-border)',
      paddingTop: 16
    }
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      fontWeight: 500,
      color: 'var(--color-primary)',
      cursor: 'pointer',
      fontSize: 14,
      textDecoration: 'none'
    },
    onClick: () => {
      setMega(false);
      nav('catalog');
    }
  }, "\u0E14\u0E39\u0E04\u0E2D\u0E23\u0E4C\u0E2A\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: toggleTheme,
    "aria-label": theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด',
    style: {
      display: 'flex',
      height: 44,
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-md)',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--color-text)',
      fontSize: 20,
      transition: 'background-color .2s ease-out'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--color-surface-muted)',
    onMouseLeave: e => e.currentTarget.style.background = 'none'
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'}`,
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("div", {
    className: "suk-lang"
  }, /*#__PURE__*/React.createElement("button", {
    className: lang === 'th' ? 'cur' : '',
    onClick: () => setLang('th')
  }, "\u0E44\u0E17\u0E22"), /*#__PURE__*/React.createElement("button", {
    className: lang === 'en' ? 'cur' : '',
    onClick: () => setLang('en')
  }, "English")), authed ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, "\u0E04\u0E38\u0E13\u0E1C\u0E39\u0E49\u0E40\u0E23\u0E35\u0E22\u0E19"), /*#__PURE__*/React.createElement(DS.Button, {
    size: "sm",
    variant: "ghost",
    onClick: onSignOut
  }, "\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(DS.Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => nav('login')
  }, "\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A"), /*#__PURE__*/React.createElement(DS.Button, {
    size: "sm",
    onClick: () => nav('login')
  }, "\u0E2A\u0E21\u0E31\u0E04\u0E23\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01")))));
}
function SiteFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "suk-footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "suk-footer-in"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--color-primary)'
    }
  }, "SIRI UpSkill"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: '28rem',
      fontSize: 14,
      color: 'var(--color-text-muted)'
    }
  }, "\u0E41\u0E1E\u0E25\u0E15\u0E1F\u0E2D\u0E23\u0E4C\u0E21\u0E40\u0E23\u0E35\u0E22\u0E19\u0E2D\u0E2D\u0E19\u0E44\u0E25\u0E19\u0E4C\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E17\u0E31\u0E01\u0E29\u0E30\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E44\u0E14\u0E49\u0E08\u0E23\u0E34\u0E07\u0E43\u0E19\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 12,
      color: 'var(--color-text-muted)'
    }
  }, "\xA9 2026 SIRI UpSkill \u0E2A\u0E07\u0E27\u0E19\u0E25\u0E34\u0E02\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C")));
}
Object.assign(window, {
  SiteHeader,
  SiteFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/data.js
try { (() => {
window.SU_DATA = {
  categories: [{
    slug: 'marketing',
    icon: 'ph-megaphone',
    th: 'การตลาดดิจิทัล',
    children: ['Social Media Ads', 'SEO & Content', 'Email Marketing']
  }, {
    slug: 'coding',
    icon: 'ph-code',
    th: 'การเขียนโปรแกรม',
    children: ['Web Development', 'Mobile Apps', 'Data & AI']
  }, {
    slug: 'finance',
    icon: 'ph-coins',
    th: 'การเงินการลงทุน',
    children: ['หุ้นและกองทุน', 'วางแผนเกษียณ', 'ภาษีบุคคล']
  }],
  courses: [{
    id: 1,
    title: 'React เบื้องต้นสำหรับมือใหม่',
    instructor: 'อ.สมชาย ใจดี',
    price: 1290,
    comparePrice: 2490,
    rating: 4.7,
    count: 321,
    cat: 'coding',
    hours: 12,
    minutes: 30,
    lessons: 48,
    level: 'เริ่มต้น',
    desc: 'เรียนรู้พื้นฐาน React ตั้งแต่ศูนย์ — component, state, hooks และการต่อ API จริง จบคอร์สสร้างเว็บแอปของตัวเองได้',
    outcomes: ['สร้าง component และจัดการ state ได้อย่างมั่นใจ', 'ใช้ hooks หลัก (useState, useEffect) ในงานจริง', 'ต่อ REST API และจัดการข้อมูล', 'โครงสร้างโปรเจกต์แบบมืออาชีพ'],
    requirements: ['พื้นฐาน HTML/CSS/JavaScript', 'คอมพิวเตอร์ที่ติดตั้ง Node.js ได้'],
    sections: [{
      name: 'เริ่มต้นกับ React',
      count: 6,
      free: true
    }, {
      name: 'Components และ Props',
      count: 9
    }, {
      name: 'State และ Hooks',
      count: 12
    }, {
      name: 'ต่อ API และโปรเจกต์จบ',
      count: 21
    }]
  }, {
    id: 2,
    title: 'Digital Marketing ครบวงจร ตั้งแต่เริ่มต้นจนโปร',
    instructor: 'คุณนภา วงศ์สว่าง',
    price: 1890,
    comparePrice: 3200,
    rating: 4.5,
    count: 128,
    cat: 'marketing',
    hours: 15,
    minutes: 0,
    lessons: 56,
    level: 'ทุกระดับ'
  }, {
    id: 3,
    title: 'การเงินส่วนบุคคล: วางแผนเกษียณอย่างมั่นคง',
    instructor: 'ดร.ประวิทย์ ศรีสุข',
    price: 990,
    rating: 4.8,
    count: 412,
    cat: 'finance',
    hours: 8,
    minutes: 45,
    lessons: 32,
    level: 'เริ่มต้น'
  }, {
    id: 4,
    title: 'Python สำหรับ Data Analysis',
    instructor: 'อ.กิตติพงษ์ เรืองศรี',
    price: 1590,
    rating: 4.6,
    count: 203,
    cat: 'coding',
    hours: 14,
    minutes: 20,
    lessons: 52,
    level: 'ปานกลาง'
  }, {
    id: 5,
    title: 'SEO ยุคใหม่: ติดหน้าแรก Google อย่างยั่งยืน',
    instructor: 'คุณอรทัย บุญมี',
    price: 1290,
    rating: 4.4,
    count: 87,
    cat: 'marketing',
    hours: 9,
    minutes: 10,
    lessons: 38,
    level: 'ปานกลาง'
  }, {
    id: 6,
    title: 'ลงทุนหุ้นไทยฉบับมือใหม่',
    instructor: 'คุณธนา รัตนกุล',
    price: 790,
    comparePrice: 1490,
    rating: 4.3,
    count: 156,
    cat: 'finance',
    hours: 6,
    minutes: 30,
    lessons: 24,
    level: 'เริ่มต้น'
  }, {
    id: 7,
    title: 'สร้าง Mobile App ด้วย Flutter',
    instructor: 'อ.สมชาย ใจดี',
    price: 1990,
    rating: 4.9,
    count: 98,
    cat: 'coding',
    hours: 18,
    minutes: 0,
    lessons: 64,
    level: 'ปานกลาง'
  }, {
    id: 8,
    title: 'Content Creator มืออาชีพ: เขียนให้ขายได้',
    instructor: 'คุณนภา วงศ์สว่าง',
    price: 890,
    rating: 0,
    count: 0,
    cat: 'marketing',
    hours: 5,
    minutes: 45,
    lessons: 20,
    level: 'เริ่มต้น'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/data.js", error: String((e && e.message) || e) }); }

__ds_ns.CourseCard = __ds_scope.CourseCard;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Pagination = __ds_scope.Pagination;

})();
