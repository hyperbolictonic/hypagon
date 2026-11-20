/**
 * Every element the wrap/secrets panel touches, exported once.
 *
 * The secrets form and the wrapper modal share a credential sub-form, so neither module can own
 * these handles; both import them from here.
 */

/** When to use: the Warning control in the wrap panel. */
export const wrapWarningEl = document.getElementById('settings-wrap-warning') as HTMLElement;
/** When to use: the Form control in the wrap panel. */
export const wrapFormEl = document.getElementById('settings-wrap-secret-form') as HTMLFormElement;
/** When to use: the Name control in the wrap panel. */
export const wrapNameEl = document.getElementById('settings-wrap-name') as HTMLInputElement;
/** When to use: the Header control in the wrap panel. */
export const wrapHeaderEl = document.getElementById('settings-wrap-header') as HTMLInputElement;
/** When to use: the Value control in the wrap panel. */
export const wrapValueEl = document.getElementById('settings-wrap-value') as HTMLInputElement;
/** When to use: the Hosts control in the wrap panel. */
export const wrapHostsEl = document.getElementById('settings-wrap-hosts') as HTMLInputElement;
/** When to use: the Prefix control in the wrap panel. */
export const wrapPrefixEl = document.getElementById('settings-wrap-prefix') as HTMLInputElement;
/** When to use: the Kind control in the wrap panel. */
export const wrapKindEl = document.getElementById('settings-wrap-kind') as HTMLSelectElement;
/** When to use: the OAuth control in the wrap panel. */
export const wrapOAuthEl = document.getElementById('settings-wrap-oauth') as HTMLElement;
/** When to use: the TokenUrl control in the wrap panel. */
export const wrapTokenUrlEl = document.getElementById('settings-wrap-token-url') as HTMLInputElement;
/** When to use: the ClientId control in the wrap panel. */
export const wrapClientIdEl = document.getElementById('settings-wrap-client-id') as HTMLInputElement;
/** When to use: the Scope control in the wrap panel. */
export const wrapScopeEl = document.getElementById('settings-wrap-scope') as HTMLInputElement;
/** When to use: the Result control in the wrap panel. */
export const wrapResultEl = document.getElementById('settings-wrap-result') as HTMLElement;
/** When to use: the Refresh control in the wrap panel. */
export const wrapRefreshEl = document.getElementById('settings-wrap-refresh') as HTMLButtonElement;
/** When to use: the Save control in the wrap panel. */
export const wrapSaveEl = document.querySelector<HTMLButtonElement>('#settings-wrap-secret-form button[type="submit"]');
/** When to use: the List control in the wrap panel. */
export const wrapListEl = document.getElementById('settings-wrap-secret-list') as HTMLElement;
/** When to use: the CancelEdit control in the wrap panel. */
export const wrapCancelEditEl = document.getElementById('settings-wrap-cancel-edit') as HTMLButtonElement;
/** When to use: the SubTabs control in the wrap panel. */
export const wrapSubTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-wrap-tab]'));
/** When to use: the SubPanels control in the wrap panel. */
export const wrapSubPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-wrap-panel]'));
/** When to use: the WrapperModal control in the wrap panel. */
export const wrapWrapperModalEl = document.getElementById('wrap-wrapper-modal') as HTMLDialogElement;
/** When to use: the WrapperClose control in the wrap panel. */
export const wrapWrapperCloseEl = document.getElementById('settings-wrap-wrapper-close') as HTMLButtonElement;
/** When to use: the WrapperCancel control in the wrap panel. */
export const wrapWrapperCancelEl = document.getElementById('settings-wrap-wrapper-cancel') as HTMLButtonElement;
/** When to use: the WrapperList control in the wrap panel. */
export const wrapWrapperListEl = document.getElementById('settings-wrap-wrapper-list') as HTMLElement;
/** When to use: the WrapperFilter control in the wrap panel. */
export const wrapWrapperFilterEl = document.getElementById('settings-wrap-wrapper-filter') as HTMLInputElement;
/** When to use: the WrapperHeading control in the wrap panel. */
export const wrapWrapperHeadingEl = document.getElementById('settings-wrap-wrapper-heading') as HTMLElement;
/** When to use: the WrapperTitle control in the wrap panel. */
export const wrapWrapperTitleEl = document.getElementById('settings-wrap-wrapper-title') as HTMLElement;
/** When to use: the WrapperBadge control in the wrap panel. */
export const wrapWrapperBadgeEl = document.getElementById('settings-wrap-wrapper-badge') as HTMLElement;
/** When to use: the WrapperForm control in the wrap panel. */
export const wrapWrapperFormEl = document.getElementById('settings-wrap-wrapper-form') as HTMLFormElement;
/** When to use: the WrapperResult control in the wrap panel. */
export const wrapWrapperResultEl = document.getElementById('settings-wrap-wrapper-result') as HTMLElement;
/** When to use: the WrapperSave control in the wrap panel. */
export const wrapWrapperSaveEl = document.getElementById('settings-wrap-wrapper-save') as HTMLButtonElement;
/** When to use: the WrapperDelete control in the wrap panel. */
export const wrapWrapperDeleteEl = document.getElementById('settings-wrap-wrapper-delete') as HTMLButtonElement;
/** When to use: the WrapperNew control in the wrap panel. */
export const wrapWrapperNewEl = document.getElementById('settings-wrap-wrapper-new') as HTMLButtonElement;
/** When to use: the WrapperRefresh control in the wrap panel. */
export const wrapWrapperRefreshEl = document.getElementById('settings-wrap-wrapper-refresh') as HTMLButtonElement;
/** When to use: the FieldName control in the wrap panel. */
export const wrapFieldNameEl = document.getElementById('settings-wrap-field-name') as HTMLInputElement;
/** When to use: the FieldId control in the wrap panel. */
export const wrapFieldIdEl = document.getElementById('settings-wrap-field-id') as HTMLInputElement;
/** When to use: the FieldDescription control in the wrap panel. */
export const wrapFieldDescriptionEl = document.getElementById('settings-wrap-field-description') as HTMLInputElement;
/** When to use: the FieldMethod control in the wrap panel. */
export const wrapFieldMethodEl = document.getElementById('settings-wrap-field-method') as HTMLSelectElement;
/** When to use: the FieldUrl control in the wrap panel. */
export const wrapFieldUrlEl = document.getElementById('settings-wrap-field-url') as HTMLInputElement;
/** When to use: the FieldAuth control in the wrap panel. */
export const wrapFieldAuthEl = document.getElementById('settings-wrap-field-auth') as HTMLSelectElement;
/** When to use: the FieldMutating control in the wrap panel. */
export const wrapFieldMutatingEl = document.getElementById('settings-wrap-field-mutating') as HTMLInputElement;
/** When to use: the CredentialPanel control in the wrap panel. */
export const wrapCredentialPanelEl = document.getElementById('settings-wrap-credential-panel') as HTMLElement;
/** When to use: the CredentialName control in the wrap panel. */
export const wrapCredentialNameEl = document.getElementById('settings-wrap-credential-name') as HTMLInputElement;
/** When to use: the CredentialValue control in the wrap panel. */
export const wrapCredentialValueEl = document.getElementById('settings-wrap-credential-value') as HTMLInputElement;
/** When to use: the CredentialHosts control in the wrap panel. */
export const wrapCredentialHostsEl = document.getElementById('settings-wrap-credential-hosts') as HTMLInputElement;
/** When to use: the CredentialHeader control in the wrap panel. */
export const wrapCredentialHeaderEl = document.getElementById('settings-wrap-credential-header') as HTMLInputElement;
/** When to use: the CredentialPrefix control in the wrap panel. */
export const wrapCredentialPrefixEl = document.getElementById('settings-wrap-credential-prefix') as HTMLInputElement;
/** When to use: the FieldInputSchema control in the wrap panel. */
export const wrapFieldInputSchemaEl = document.getElementById('settings-wrap-field-input-schema') as HTMLTextAreaElement;
/** When to use: the FieldQuery control in the wrap panel. */
export const wrapFieldQueryEl = document.getElementById('settings-wrap-field-query') as HTMLTextAreaElement;
/** When to use: the FieldHeaders control in the wrap panel. */
export const wrapFieldHeadersEl = document.getElementById('settings-wrap-field-headers') as HTMLTextAreaElement;
/** When to use: the FieldBody control in the wrap panel. */
export const wrapFieldBodyEl = document.getElementById('settings-wrap-field-body') as HTMLTextAreaElement;
/** When to use: the FieldBodyFormat control in the wrap panel. */
export const wrapFieldBodyFormatEl = document.getElementById('settings-wrap-field-body-format') as HTMLSelectElement;
/** When to use: the FieldResponse control in the wrap panel. */
export const wrapFieldResponseEl = document.getElementById('settings-wrap-field-response') as HTMLTextAreaElement;
/** When to use: the FieldNotes control in the wrap panel. */
export const wrapFieldNotesEl = document.getElementById('settings-wrap-field-notes') as HTMLInputElement;
