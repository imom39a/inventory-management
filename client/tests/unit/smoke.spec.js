import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguageSwitcher from '../../src/components/LanguageSwitcher.vue'

describe('test harness', () => {
  it('mounts a Vue component in jsdom', () => {
    const wrapper = mount(LanguageSwitcher)
    expect(wrapper.find('.language-switcher').exists()).toBe(true)
  })
})
