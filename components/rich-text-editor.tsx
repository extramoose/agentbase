'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange?: (md: string) => void
  onBlur?: (md: string) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  minHeight?: string
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly = false,
  className,
  minHeight = '100px',
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getHTML())
    },
    onBlur: ({ editor: ed }) => {
      onBlurRef.current?.(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-invert prose-sm max-w-none focus:outline-none p-3`,
        style: `min-height:${minHeight}`,
      },
    },
  })

  // Sync value from parent when it changes externally
  const prevValueRef = useRef(value)
  useEffect(() => {
    if (!editor) return
    if (value === prevValueRef.current) return
    prevValueRef.current = value
    // Only reset if the incoming value differs from current editor content
    const currentHTML = editor.getHTML()
    if (currentHTML !== value) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  // Sync readOnly
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [readOnly, editor])

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-muted/20 focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
