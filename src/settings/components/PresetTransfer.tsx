export function PresetTransfer(props: { labels: Record<'heading' | 'json' | 'import' | 'export', string>; onImport: (json: string) => void | Promise<void>; onExport: () => void | Promise<void> }) {
  let input!: HTMLTextAreaElement;
  return <section class="settings-form"><h3>{props.labels.heading}</h3>
    <label>{props.labels.json}<textarea class="ui-target" ref={input} maxlength="1048576" /></label>
    <div><button class="ui-target" type="button" onClick={() => void props.onImport(input.value)}>{props.labels.import}</button>
      <button class="ui-target" type="button" onClick={() => void props.onExport()}>{props.labels.export}</button></div>
  </section>;
}
