import { GCODE_FLAVORS } from '../../settings/schema';

export interface CustomPrinterValues {
  name: string; width: number; depth: number; height: number; nozzle: number;
  flavor: typeof GCODE_FLAVORS[number]; startGcode: string; endGcode: string; heatedBed: boolean;
}
export interface CustomPrinterFormProps {
  labels: Record<'heading' | 'name' | 'width' | 'depth' | 'height' | 'nozzle' | 'flavor' | 'start' | 'end' | 'heated' | 'save' | 'disclaimer', string>;
  onSubmit: (values: CustomPrinterValues) => void | Promise<void>;
}

export function CustomPrinterForm(props: CustomPrinterFormProps) {
  return <form class="settings-form" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void props.onSubmit({
      name: String(data.get('name') ?? ''), width: Number(data.get('width')), depth: Number(data.get('depth')),
      height: Number(data.get('height')), nozzle: Number(data.get('nozzle')), flavor: String(data.get('flavor')) as CustomPrinterValues['flavor'],
      startGcode: String(data.get('start') ?? ''), endGcode: String(data.get('end') ?? ''), heatedBed: data.get('heated') === 'on',
    });
  }}>
    <h3>{props.labels.heading}</h3><p>{props.labels.disclaimer}</p>
    <label>{props.labels.name}<input class="ui-target" name="name" required maxlength="128" /></label>
    <label>{props.labels.width}<input class="ui-target" name="width" type="number" min="1" max="2000" value="220" required /></label>
    <label>{props.labels.depth}<input class="ui-target" name="depth" type="number" min="1" max="2000" value="220" required /></label>
    <label>{props.labels.height}<input class="ui-target" name="height" type="number" min="1" max="2000" value="250" required /></label>
    <label>{props.labels.nozzle}<input class="ui-target" name="nozzle" type="number" min="0.1" max="2" step="0.1" value="0.4" required /></label>
    <label>{props.labels.flavor}<select class="ui-target" name="flavor"><ForFlavor /></select></label>
    <label>{props.labels.start}<textarea class="ui-target" name="start" maxlength="65536">G28&#10;G90</textarea></label>
    <label>{props.labels.end}<textarea class="ui-target" name="end" maxlength="65536">M104 S0&#10;M140 S0&#10;M84</textarea></label>
    <label><input class="ui-target" name="heated" type="checkbox" checked />{props.labels.heated}</label>
    <button class="ui-target" type="submit">{props.labels.save}</button>
  </form>;
}

function ForFlavor() { return <>{GCODE_FLAVORS.map(flavor => <option value={flavor}>{flavor}</option>)}</>; }
