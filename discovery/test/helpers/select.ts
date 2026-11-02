import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

export async function chooseOption(locator: Locator, value: string) {
  const trigger = locator.and(locator.page().getByRole("combobox")).filter({ visible: true });
  await trigger.click();
  const popupId = await trigger.getAttribute("aria-controls");
  if (!popupId) throw new Error("The custom dropdown has no associated menu.");
  await locator
    .page()
    .locator(
      `[id=${JSON.stringify(popupId)}] [role="option"][data-value=${JSON.stringify(value)}]`,
    )
    .click();
  await expect(trigger).toHaveAttribute("data-value", value);
}
