import browser from 'webextension-polyfill';
import { Message, MessageType } from '@/types';

/**
 * Send a message to the background service worker
 */
export async function sendToBackground<T = any>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message);
}

/**
 * Send a message to a specific tab
 */
export async function sendToTab<T = any>(tabId: number, message: Message): Promise<T> {
  return browser.tabs.sendMessage(tabId, message);
}

/**
 * Send a message to all tabs
 */
export async function broadcastToTabs(message: Message): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((tab) => tab.id && sendToTab(tab.id, message)));
}

/**
 * Add a message listener
 */
export function addMessageListener(
  callback: (message: Message, sender: browser.Runtime.MessageSender) => Promise<any> | any
): void {
  browser.runtime.onMessage.addListener((message: any, sender: browser.Runtime.MessageSender) => {
    return callback(message as Message, sender);
  });
}

/**
 * Create a typed message
 */
export function createMessage<T = any>(type: MessageType, payload?: T): Message {
  return { type, payload };
}
