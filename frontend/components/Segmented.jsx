'use client';

// Grupo de botões em que só um fica marcado (substitui o <select> para poucas opções).
// options: lista de strings ou de { value, label }.
export default function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => {
        const { value: v, label: text } = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        );
      })}
    </div>
  );
}
