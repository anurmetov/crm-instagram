import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import './Select.css';

export type SelectOption = { value: string; label: string; description?: string; color?: string; icon?: ReactNode };
type Props = {
  label: string; options: readonly SelectOption[]; name?: string; value?: string; defaultValue?: string;
  onValueChange?: (value: string) => void; placeholder?: string; disabled?: boolean; className?: string; icon?: ReactNode;
};

export function Select({ label, options, name, value, defaultValue, onValueChange, placeholder = 'Выберите вариант', disabled, className = '', icon }: Props) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? '');
  const selectedValue = value ?? internalValue;
  const selected = options.find(option => option.value === selectedValue);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null), popover = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', at: 0 });

  function close(restoreFocus = false) {
    popover.current?.hidePopover(); setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function show(index = Math.max(0, options.findIndex(option => option.value === selectedValue))) {
    if (disabled || !options.length) return;
    typeahead.current = { text: '', at: 0 };
    setActive(index); setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    close(true); setInternalValue(option.value);
    if (option.value !== selectedValue) onValueChange?.(option.value);
  }

  useEffect(() => {
    const element = popover.current!;
    function syncOpen() { if (!element.matches(':popover-open')) setOpen(false); }
    element.addEventListener('toggle', syncOpen);
    return () => element.removeEventListener('toggle', syncOpen);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const element = popover.current!, button = trigger.current!;
    element.showPopover();
    function position() {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      element.style.setProperty('--select-viewport-top', `${top}px`);
      element.style.setProperty('--select-viewport-height', `${height}px`);
      const rect = button.getBoundingClientRect(), margin = 12, gap = 8;
      const menuWidth = Math.min(Math.max(rect.width, 272), width - margin * 2);
      const below = top + height - rect.bottom - gap - margin, above = rect.top - top - gap - margin;
      const contentHeight = Math.min((list.current?.scrollHeight ?? 0) + 14, 460);
      const upward = below < contentHeight && above > below;
      const menuHeight = Math.max(0, Math.min(contentHeight, upward ? above : below));
      element.style.setProperty('--select-width', `${menuWidth}px`);
      element.style.setProperty('--select-left', `${Math.max(left + margin, Math.min(rect.left, left + width - menuWidth - margin))}px`);
      element.style.setProperty('--select-top', `${upward ? rect.top - gap - menuHeight : rect.bottom + gap}px`);
      element.style.setProperty('--select-max-height', `${menuHeight}px`);
    }
    position();
    const observer = new ResizeObserver(position); observer.observe(button);
    // Scrolling the form keeps the menu attached to its field.
    function onScroll(event: Event) { if (!element.contains(event.target as Node)) position(); }
    window.addEventListener('resize', position); document.addEventListener('scroll', onScroll, true);
    window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    return () => {
      element.hidePopover(); observer.disconnect(); window.removeEventListener('resize', position);
      document.removeEventListener('scroll', onScroll, true);
      window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const container = list.current!, item = container.children[active] as HTMLElement | undefined;
    if (!item) return;
    const top = item.offsetTop - container.offsetTop, bottom = top + item.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(max-width: 900px)'), previous = document.body.style.overflow;
    function lockScroll() { document.body.style.overflow = media.matches ? 'hidden' : previous; }
    lockScroll(); media.addEventListener('change', lockScroll);
    return () => { document.body.style.overflow = previous; media.removeEventListener('change', lockScroll); };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !open) return;
    if (event.currentTarget === popover.current && (event.target as HTMLElement).closest('button') && !['Escape', 'Tab'].includes(event.key)) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { if (open) close(true); return; }
      if (event.key === 'Enter' || event.key === ' ') { if (open) choose(active); else show(); return; }
      if (event.key === 'Home') { if (open) setActive(0); else show(0); return; }
      if (event.key === 'End') { if (open) setActive(options.length - 1); else show(options.length - 1); return; }
      if (!open) show();
      else setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (event.key === 'Tab') { if (open) close(); return; }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    const now = Date.now(), previous = now - typeahead.current.at < 700 ? typeahead.current.text : '';
    const query = previous + event.key.toLocaleLowerCase('ru');
    typeahead.current = { text: query, at: now };
    const search = [...query].every(character => character === query[0]) ? query[0] : query;
    const start = open ? active : options.findIndex(option => option.value === selectedValue);
    const match = options.map((_, index) => (Math.max(0, start) + index + 1) % options.length)
      .find(index => options[index].label.toLocaleLowerCase('ru').startsWith(search));
    if (match !== undefined) { event.preventDefault(); if (open) setActive(match); else { show(match); typeahead.current = { text: query, at: now }; } }
  }

  return <div className={`custom-select ${className}`}>
    {name && <input type="hidden" name={name} value={selectedValue} disabled={disabled} />}
    <button ref={trigger} type="button" className="select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled}
      onClick={() => open ? close() : show()} onKeyDown={onKeyDown}
      onBlur={event => { if (open && event.relatedTarget && !popover.current?.contains(event.relatedTarget)) close(); }}>
      {(icon || selected?.icon) && <span className="select-leading-icon" aria-hidden="true">{icon || selected?.icon}</span>}
      {selected?.color && <i className="select-color-dot" style={{ '--option-color': selected.color } as CSSProperties} aria-hidden="true" />}
      <span className={`select-value ${selected ? '' : 'select-placeholder'}`}>{selected?.label ?? placeholder}</span>
      <ChevronDown size={16} className="select-chevron" aria-hidden="true" />
    </button>
    <div ref={popover} popover="auto" className="select-popover" onKeyDown={onKeyDown} onPointerDown={event => { if (event.target === event.currentTarget) event.preventDefault(); }} onClick={event => { if (event.target === event.currentTarget) close(true); }}>
      <div className="select-menu">
        <div className="select-sheet-handle" aria-hidden="true" />
        <div className="select-menu-header"><h3 id={`${id}-heading`}>{label}</h3><button type="button" className="select-close" aria-label="Закрыть выбор" onClick={() => close(true)}><X size={19} /></button></div>
        <div ref={list} id={`${id}-list`} className="select-options" role="listbox" aria-label={label}>
          {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-label={option.label} aria-selected={selectedValue === option.value} aria-describedby={option.description ? `${id}-description-${index}` : undefined}
            className={`select-option ${active === index ? 'is-active' : ''}`} onPointerMove={event => { if (event.pointerType === 'mouse') setActive(index); }}
            onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
            {option.icon && <span className="select-option-icon" aria-hidden="true">{option.icon}</span>}
            {option.color && <span className="select-option-color" style={{ '--option-color': option.color } as CSSProperties} aria-hidden="true"><i /></span>}
            <span className="select-option-copy"><span>{option.label}</span>{option.description && <small id={`${id}-description-${index}`}>{option.description}</small>}</span>
            <span className="select-option-check" aria-hidden="true">{selectedValue === option.value && <Check size={15} strokeWidth={2.5} />}</span>
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}
