import type { FormDefinition, FormSubmission } from "../model/form.types";
const FORMS = "integration-hub.forms.v1";
const SUBMISSIONS = "integration-hub.form-submissions.v1";
const read = <T>(key: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};
export const formStorage = {
  forms: () => read<FormDefinition>(FORMS),
  get: (id: string) =>
    read<FormDefinition>(FORMS).find((form) => form.id === id),
  save: (form: FormDefinition) => {
    const forms = read<FormDefinition>(FORMS);
    const i = forms.findIndex((x) => x.id === form.id);
    i >= 0 ? forms.splice(i, 1, form) : forms.unshift(form);
    localStorage.setItem(FORMS, JSON.stringify(forms));
  },
  remove: (id: string) =>
    localStorage.setItem(
      FORMS,
      JSON.stringify(read<FormDefinition>(FORMS).filter((x) => x.id !== id)),
    ),
  submissions: (formId: string) =>
    read<FormSubmission>(SUBMISSIONS).filter((x) => x.formId === formId),
  submit: (submission: FormSubmission) =>
    localStorage.setItem(
      SUBMISSIONS,
      JSON.stringify([submission, ...read<FormSubmission>(SUBMISSIONS)]),
    ),
};
