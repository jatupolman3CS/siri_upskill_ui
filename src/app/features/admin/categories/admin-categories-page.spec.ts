import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../core/http/error.interceptor';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { CategoryTreeNode } from '../../catalog/data/category-api.models';
import { AdminCategoriesPage } from './admin-categories-page';

const URL = '/api/catalog/admin/categories';

function node(id: string, slug: string, nameTh: string, nameEn: string, children: CategoryTreeNode[] = [], isActive = true): CategoryTreeNode {
  return { id, slug, nameTh, nameEn, iconKey: id === 'root1' ? 'megaphone' : null, sortOrder: 0, isActive, children };
}

// Marketing ── SEO (inactive)
//           └─ Branding
// Finance
const TREE: CategoryTreeNode[] = [
  node('root1', 'marketing', 'การตลาด', 'Marketing', [
    node('child1', 'seo', 'เอสอีโอ', 'SEO', [], false),
    node('child2', 'branding', 'แบรนด์', 'Branding'),
  ]),
  node('root2', 'finance', 'การเงิน', 'Finance'),
];

describe('AdminCategoriesPage', () => {
  let fixture: ComponentFixture<AdminCategoriesPage>;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let toastSuccess: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AdminCategoriesPage],
      providers: [
        // Same shape as production: fetch backend + the error interceptor that turns failures into ApiError.
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    // English only so text lookups below match stable ASCII strings.
    TestBed.inject(TranslationService).setLocale('en');
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    toastSuccess = vi.spyOn(toast, 'success');
    fixture = TestBed.createComponent(AdminCategoriesPage);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function loadTree(tree: readonly CategoryTreeNode[] = TREE): Promise<void> {
    fixture.detectChanges();
    httpMock.expectOne(URL).flush(tree);
    await settle();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const dialog = (): HTMLElement | null => root().querySelector('[role="dialog"]');
  const byLabel = (label: string): HTMLButtonElement | null => root().querySelector(`button[aria-label="${label}"]`);

  function buttonByText(text: string, within: ParentNode = root()): HTMLButtonElement {
    const found = Array.from(within.querySelectorAll('button')).find((button) => button.textContent?.trim() === text);
    if (!found) {
      throw new Error(`No button "${text}"`);
    }
    return found;
  }

  function setInput(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function formInputs(): HTMLInputElement[] {
    return Array.from(dialog()?.querySelectorAll('input[type="text"]') ?? []) as HTMLInputElement[];
  }

  /** nameTh, nameEn, slug — the DOM order of the three text inputs. */
  async function fillForm(nameTh: string, nameEn: string, slug?: string): Promise<void> {
    const [thInput, enInput, slugInput] = formInputs();
    setInput(thInput, nameTh);
    setInput(enInput, nameEn);
    if (slug !== undefined) {
      setInput(slugInput, slug);
    }
    await settle();
  }

  function postRequest(): TestRequest {
    return httpMock.expectOne((request) => request.url === URL && request.method === 'POST');
  }

  describe('tree', () => {
    it('shows loading skeletons first, then every root and child with names, slugs and an active/inactive text badge', async () => {
      fixture.detectChanges();
      expect(root().textContent).toContain('Loading');

      httpMock.expectOne(URL).flush(TREE);
      await settle();

      const rows = Array.from(root().querySelectorAll('app-category-row'));
      expect(rows).toHaveLength(4);
      const text = rows.map((row) => row.textContent ?? '');
      expect(text[0]).toContain('Marketing');
      expect(text[0]).toContain('marketing');
      expect(text[1]).toContain('SEO');
      expect(text[1]).toContain('Inactive');
      expect(text[2]).toContain('Branding');
      expect(text[2]).toContain('Active');
      // Children are indented, roots are not.
      expect((rows[0] as HTMLElement).style.marginInlineStart).toBe('0rem');
      expect((rows[1] as HTMLElement).style.marginInlineStart).toBe('1.5rem');
    });

    it('is a labelled list, and every icon-only action has an accessible name that includes the category', async () => {
      await loadTree();

      expect(root().querySelector('ul[aria-label="Course categories"]')).not.toBeNull();
      for (const label of ['Move Marketing up', 'Move Marketing down', 'Add a subcategory to Marketing', 'Edit Marketing', 'Delete Marketing']) {
        expect(byLabel(label), label).not.toBeNull();
      }
    });

    it('shows the empty state with a prominent create-first-category call to action', async () => {
      await loadTree([]);

      expect(root().textContent).toContain('There are no categories yet');
      const cta = buttonByText('Create the first category');
      expect(cta).toBeTruthy();

      cta.click();
      await settle();
      expect(dialog()?.textContent).toContain('Create category');
    });

    it('shows an error state with retry when the list cannot be loaded, and recovers on retry', async () => {
      fixture.detectChanges();
      httpMock.expectOne(URL).flush({ title: 'boom' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(root().querySelector('[role="alert"]')?.textContent).toContain('Could not load the categories');

      buttonByText('Try again').click();
      await settle();
      httpMock.expectOne(URL).flush(TREE);
      await settle();

      expect(root().querySelectorAll('app-category-row')).toHaveLength(4);
    });
  });

  describe('create', () => {
    it('suggests the slug from the English name and POSTs exactly the create fields, then refreshes and toasts', async () => {
      await loadTree();
      buttonByText('Create category').click();
      await settle();

      await fillForm('การออกแบบ', 'UI Design');
      expect(formInputs()[2].value).toBe('ui-design');

      buttonByText('Create category', dialog() as HTMLElement).click();
      await settle();

      const request = postRequest();
      expect(request.request.body).toEqual({ slug: 'ui-design', nameTh: 'การออกแบบ', nameEn: 'UI Design', iconKey: null, parentId: null });
      request.flush({ id: 'new', slug: 'ui-design', nameTh: 'การออกแบบ', nameEn: 'UI Design', iconKey: null, parentId: null, sortOrder: 2, isActive: true });
      await settle();

      expect(toastSuccess).toHaveBeenCalledWith('Category "UI Design" created');
      httpMock.expectOne(URL).flush(TREE);
      await settle();
      expect(dialog()).toBeNull();
    });

    it('stops following the English name once the slug has been edited by hand', async () => {
      await loadTree();
      buttonByText('Create category').click();
      await settle();

      await fillForm('ก', 'First', 'my-own-slug');
      setInput(formInputs()[1], 'Second Name');
      await settle();

      expect(formInputs()[2].value).toBe('my-own-slug');
    });

    it('does not call the API when the slug breaks the backend format, and says why next to the field', async () => {
      await loadTree();
      buttonByText('Create category').click();
      await settle();

      await fillForm('การตลาด', 'Marketing', 'Bad Slug');
      buttonByText('Create category', dialog() as HTMLElement).click();
      await settle();

      expect(dialog()?.textContent).toContain('lowercase English letters');
      // httpMock.verify() in afterEach fails if a POST slipped through.
    });

    it('requires both names, and a Thai-only name leaves the slug empty so the admin must type one', async () => {
      await loadTree();
      buttonByText('Create category').click();
      await settle();

      await fillForm('การตลาด', 'การตลาด');
      expect(formInputs()[2].value).toBe('');

      buttonByText('Create category', dialog() as HTMLElement).click();
      await settle();
      expect(dialog()?.textContent).toContain('This field is required');
    });

    it('keeps the dialog open and shows the server refusal when the slug is already taken (409)', async () => {
      await loadTree();
      buttonByText('Create category').click();
      await settle();
      await fillForm('การตลาด', 'Marketing 2', 'marketing');

      buttonByText('Create category', dialog() as HTMLElement).click();
      await settle();
      postRequest().flush(
        { title: 'Conflict', detail: "Slug 'marketing' ถูกใช้แล้ว", errorCode: 'conflict' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      const alert = dialog()?.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('The slug "marketing" is already in use');
      expect(alert?.textContent).toContain('ถูกใช้แล้ว');
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('guards against a double submit: a second click while the request is in flight sends nothing', async () => {
      await loadTree();
      buttonByText('Create category').click();
      await settle();
      await fillForm('การตลาด', 'Brand New', 'brand-new');

      const submit = buttonByText('Create category', dialog() as HTMLElement);
      submit.click();
      await settle();
      submit.click();
      await settle();

      // expectOne throws if a second POST was made.
      postRequest().flush({ id: 'x', slug: 'brand-new', nameTh: 'a', nameEn: 'Brand New', iconKey: null, parentId: null, sortOrder: 0, isActive: true });
      await settle();
      httpMock.expectOne(URL).flush(TREE);
    });

    it('"add subcategory" opens the form with that category pre-selected as parent and POSTs its id', async () => {
      await loadTree();
      byLabel('Add a subcategory to Finance')?.click();
      await settle();

      expect(dialog()?.textContent).toContain('Create subcategory');
      await fillForm('บัญชี', 'Accounting');
      buttonByText('Create category', dialog() as HTMLElement).click();
      await settle();

      expect(postRequest().request.body).toEqual({ slug: 'accounting', nameTh: 'บัญชี', nameEn: 'Accounting', iconKey: null, parentId: 'root2' });
    });
  });

  describe('edit', () => {
    it('prefills the form, never rewrites the slug on its own, and PUTs the full update (incl. isActive and parent)', async () => {
      await loadTree();
      byLabel('Edit Branding')?.click();
      await settle();

      const [thInput, enInput, slugInput] = formInputs();
      expect(thInput.value).toBe('แบรนด์');
      expect(enInput.value).toBe('Branding');
      expect(slugInput.value).toBe('branding');

      setInput(enInput, 'Brand Strategy');
      await settle();
      expect(formInputs()[2].value).toBe('branding');

      (dialog()?.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
      await settle();
      buttonByText('Save changes', dialog() as HTMLElement).click();
      await settle();

      const request = httpMock.expectOne(`${URL}/child2`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        slug: 'branding',
        nameTh: 'แบรนด์',
        nameEn: 'Brand Strategy',
        iconKey: null,
        parentId: 'root1',
        isActive: false,
      });
      request.flush({ id: 'child2', slug: 'branding', nameTh: 'แบรนด์', nameEn: 'Brand Strategy', iconKey: null, parentId: 'root1', sortOrder: 1, isActive: false });
      await settle();

      expect(toastSuccess).toHaveBeenCalledWith('Category "Brand Strategy" saved');
      httpMock.expectOne(URL).flush(TREE);
    });

    it('does not offer the category itself or its own subtree as a parent', async () => {
      await loadTree();
      byLabel('Edit Marketing')?.click();
      await settle();

      const parentSelect = dialog()?.querySelectorAll('select')[0] as HTMLSelectElement;
      const labels = Array.from(parentSelect.options).map((option) => option.textContent?.trim());
      expect(labels).toEqual(['None (top-level category)', 'Finance']);
    });

    it('shows the cycle refusal from the server on a 400 and keeps the dialog open', async () => {
      await loadTree();
      byLabel('Edit Finance')?.click();
      await settle();
      buttonByText('Save changes', dialog() as HTMLElement).click();
      await settle();

      httpMock
        .expectOne(`${URL}/root2`)
        .flush({ title: 'Bad Request', detail: 'ไม่สามารถย้ายหมวดหมู่ไปไว้ใต้หมวดหมู่ย่อยของตัวเองได้', errorCode: 'validation' }, { status: 400, statusText: 'Bad Request' });
      await settle();

      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('one of its own subcategories');
    });
  });

  describe('reorder', () => {
    it('disables moving the first row up and the last row down', async () => {
      await loadTree();

      expect(byLabel('Move Marketing up')?.disabled).toBe(true);
      expect(byLabel('Move Finance down')?.disabled).toBe(true);
      expect(byLabel('Move Finance up')?.disabled).toBe(false);
    });

    it('sends the FULL sibling set renumbered, refreshes the tree and announces the new position', async () => {
      await loadTree();
      byLabel('Move Finance up')?.click();
      await settle();

      const request = httpMock.expectOne(`${URL}/reorder`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        items: [
          { categoryId: 'root2', sortOrder: 0 },
          { categoryId: 'root1', sortOrder: 1 },
        ],
      });
      request.flush(null);
      await settle();

      httpMock.expectOne(URL).flush([TREE[1], TREE[0]]);
      await settle();

      expect(root().querySelector('[role="status"]')?.textContent).toContain('Moved Finance to position 1 of 2');
      expect(root().querySelector('app-category-row')?.textContent).toContain('Finance');
    });

    it('reorders children within their own parent only', async () => {
      await loadTree();
      byLabel('Move Branding up')?.click();
      await settle();

      const request = httpMock.expectOne(`${URL}/reorder`);
      expect(request.request.body).toEqual({
        items: [
          { categoryId: 'child2', sortOrder: 0 },
          { categoryId: 'child1', sortOrder: 1 },
        ],
      });
      request.flush(null);
      await settle();
      httpMock.expectOne(URL).flush(TREE);
    });

    it('toasts the failure and reloads the real order when the server rejects the batch', async () => {
      const toastError = vi.spyOn(toast, 'error');
      await loadTree();
      byLabel('Move Finance up')?.click();
      await settle();

      httpMock
        .expectOne(`${URL}/reorder`)
        .flush({ title: 'Bad Request', detail: 'ต้องระบุให้ครบ' }, { status: 400, statusText: 'Bad Request' });
      await settle();

      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Reordering failed'));
      httpMock.expectOne(URL).flush(TREE);
    });
  });

  describe('delete', () => {
    it('asks for confirmation first — cancelling sends nothing', async () => {
      await loadTree();
      byLabel('Delete Finance')?.click();
      await settle();

      expect(dialog()?.textContent).toContain('Delete the category "Finance"');
      buttonByText('Cancel', dialog() as HTMLElement).click();
      await settle();

      expect(dialog()).toBeNull();
      // httpMock.verify() proves no DELETE went out.
    });

    it('DELETEs on confirm, toasts and refreshes', async () => {
      await loadTree();
      byLabel('Delete Finance')?.click();
      await settle();
      buttonByText('Delete category', dialog() as HTMLElement).click();
      await settle();

      const request = httpMock.expectOne(`${URL}/root2`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(toastSuccess).toHaveBeenCalledWith('Category "Finance" deleted');
      httpMock.expectOne(URL).flush([TREE[0]]);
      await settle();
      expect(dialog()).toBeNull();
      expect(root().querySelectorAll('app-category-row')).toHaveLength(3);
    });

    it('warns up front when the category has children, and shows the backend refusal when it still refuses (409)', async () => {
      await loadTree();
      byLabel('Delete Marketing')?.click();
      await settle();
      expect(dialog()?.textContent).toContain('has 2 subcategories');

      buttonByText('Delete category', dialog() as HTMLElement).click();
      await settle();
      httpMock.expectOne(`${URL}/root1`).flush(
        { title: 'Conflict', detail: 'ไม่สามารถลบหมวดหมู่ที่มีหมวดหมู่ย่อยอยู่ได้', errorCode: 'conflict' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      const alert = dialog()?.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('It cannot be deleted because it still has subcategories');
      expect(alert?.textContent).toContain('ไม่สามารถลบหมวดหมู่ที่มีหมวดหมู่ย่อยอยู่ได้');
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });
});
