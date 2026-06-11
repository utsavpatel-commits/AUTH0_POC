import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import {
  Bold, Italic, Underline as U, List, ListOrdered, Quote, Heading1, Heading2,
  Heading3, Table as TableIcon, Link2, Undo, Redo, Minus,
} from 'lucide-react';

/** Production rich-text editor for policies/procedures (tiptap). Emits HTML +
 *  the canonical tiptap JSON so the backend can store both. */
export function RichTextEditor({
  initialHtml,
  editable = true,
  bare = false,
  onChange,
}: {
  initialHtml?: string | null;
  editable?: boolean;
  bare?: boolean;   // page mode: no outer border, document-style padding
  onChange?: (html: string, json: string) => void;
}) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Start writing the policy…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: initialHtml || '',
    editorProps: { attributes: { class: bare ? 'cafe-doc min-h-[60vh] px-12 py-10' : 'cafe-doc min-h-[320px] px-4 py-3' } },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML(), JSON.stringify(editor.getJSON())),
  });

  // keep content in sync if the document being edited changes
  useEffect(() => {
    if (editor && initialHtml != null && initialHtml !== editor.getHTML()) {
      editor.commands.setContent(initialHtml || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return <div className="h-72 rounded-lg bg-slate-100 animate-pulse" />;

  if (bare) {
    return (
      <div className="bg-white">
        {editable && <Toolbar editor={editor} bare />}
        <EditorContent editor={editor} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, bare = false }: { editor: Editor; bare?: boolean }) {
  const Btn = ({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); on(); }}
      className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100 hover:text-navy-800'}`}>
      {children}
    </button>
  );
  const sep = <span className="w-px h-5 bg-slate-200 mx-1" />;
  return (
    <div className={`flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 sticky top-0 z-10 ${bare ? 'bg-white/95 backdrop-blur rounded-t-2xl' : 'bg-slate-50/70'}`}>
      <Btn title="Heading 1" active={editor.isActive('heading', { level: 1 })} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></Btn>
      <Btn title="Heading 2" active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Btn>
      <Btn title="Heading 3" active={editor.isActive('heading', { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Btn>
      {sep}
      <Btn title="Bold" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></Btn>
      <Btn title="Italic" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></Btn>
      <Btn title="Underline" active={editor.isActive('underline')} on={() => editor.chain().focus().toggleUnderline().run()}><U size={15} /></Btn>
      {sep}
      <Btn title="Bullet list" active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></Btn>
      <Btn title="Numbered list" active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
      <Btn title="Quote" active={editor.isActive('blockquote')} on={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></Btn>
      <Btn title="Divider" on={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></Btn>
      {sep}
      <Btn title="Insert table" on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></Btn>
      <Btn title="Link" active={editor.isActive('link')} on={() => {
        const url = window.prompt('Link URL'); if (url) editor.chain().focus().setLink({ href: url }).run();
        else editor.chain().focus().unsetLink().run();
      }}><Link2 size={15} /></Btn>
      {sep}
      <Btn title="Undo" on={() => editor.chain().focus().undo().run()}><Undo size={15} /></Btn>
      <Btn title="Redo" on={() => editor.chain().focus().redo().run()}><Redo size={15} /></Btn>
    </div>
  );
}
