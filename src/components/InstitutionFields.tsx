import { DEGREES } from "@/lib/constants";
import { Field } from "@/components/Field";

export type InstitutionOption = { id: string; name: string; slug: string; short_name?: string };

/** Institution, graduating year, degree and department: one alumni membership. */
export function InstitutionFields({
  institutions,
  defaultInstitution = "",
  gradYear = "",
  degree = "",
  department = "",
}: {
  institutions: InstitutionOption[];
  defaultInstitution?: string;
  gradYear?: number | "";
  degree?: string;
  department?: string;
}) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id="institutionId" label="Institution" hint="Not listed? Your institution can apply to join; see the link below the form.">
          <select className="input" id="institutionId" name="institutionId" defaultValue={defaultInstitution}>
            <option value="">Choose…</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="gradYear" label="Graduating year">
        <input className="input tabular" id="gradYear" name="gradYear" type="number" inputMode="numeric" min={1940}
          max={new Date().getFullYear() + 1} placeholder="2005" defaultValue={gradYear} />
      </Field>
      <Field id="degree" label="Degree">
        <input className="input" id="degree" name="degree" list="degree-options" defaultValue={degree} placeholder="B.Tech / B.E." />
        <datalist id="degree-options">
          {DEGREES.map((d) => <option key={d} value={d} />)}
        </datalist>
      </Field>
      <div className="sm:col-span-2">
        <Field id="department" label="Department or major">
          <input className="input" id="department" name="department" defaultValue={department} placeholder="Electronics and Communication" />
        </Field>
      </div>
    </div>
  );
}
