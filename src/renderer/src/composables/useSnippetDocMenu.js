import { computed } from 'vue'
import { t } from '../i18n'
import { MOD } from '../keys'
import { useCopyAsFile } from './useCopyAsFile'
import { snippetFile } from '../utils/copyAsFile'
import { useDiffStore } from '../stores/diffStore'
import { useLanStore } from '../features/lan'
import { useShareStore } from '../features/share'

const formatItem = (language) =>
  language === 'mermaid'
    ? { action: 'format', label: t('snippetEditorActions.repair'), icon: 'wrench' }
    : { action: 'format', label: t('snippetEditorActions.format'), icon: 'braces' }

export function useSnippetDocMenu(props, emit) {
  const lan = useLanStore()
  const { supported: canCopyFile, copyFile } = useCopyAsFile()
  async function copyAsFile() {
    const draft = { name: props.name, content: props.content, secret: props.secret }
    if (await copyFile(snippetFile({ ...draft, lang: props.language }))) {
      useDiffStore().showNotice(t('snippetEditorActions.copiedAsFile'))
    }
  }
  const shareSnippet = () =>
    useShareStore().openSnippetShare({
      id: props.snippetId,
      name: props.name,
      content: props.content,
      language: props.language
    })
  const items = computed(() => {
    const off = !props.hasContent || props.secret
    return [
      ...(props.snippetId
        ? [{ action: 'history', label: t('snippetEditorActions.history'), icon: 'clock' }]
        : []),
      { ...formatItem(props.language), disabled: !props.canFormat },
      ...(lan.isActive && props.snippetId
        ? [{ action: 'share', label: t('lan.share.snippetMenu'), icon: 'send', disabled: off }]
        : []),
      ...(canCopyFile.value
        ? [
            {
              action: 'copy-file',
              label: t('snippetEditorActions.copyAsFile'),
              icon: 'clipboard',
              disabled: off
            }
          ]
        : []),
      {
        action: 'save-file',
        label: t('snippetEditorActions.saveAsFile'),
        icon: 'save',
        keys: `${MOD}+Alt+S`,
        disabled: off
      }
    ]
  })
  const EMITS = { format: 'format', history: 'history', 'save-file': 'saveAsFile' }
  const LOCAL = { 'copy-file': copyAsFile, share: shareSnippet }
  const onAction = (action) => (LOCAL[action] ? LOCAL[action]() : emit(EMITS[action]))
  return { items, onAction }
}
