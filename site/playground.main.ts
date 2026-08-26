/**
 * The browser bundle's entry point: everything the playground does lives in
 * `playground.ts`, which stays free of side effects so its logic can be tested
 * without a DOM. This file is the one line that isn't testable that way.
 */
import { mount } from "./playground.js";

mount();
