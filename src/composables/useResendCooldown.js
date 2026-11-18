import { computed, onBeforeUnmount, ref } from 'vue'

export function useResendCooldown(duration = 60) {
  const secondsLeft = ref(0)
  let timer = null

  const isCoolingDown = computed(() => secondsLeft.value > 0)

  function start() {
    secondsLeft.value = duration
    clearInterval(timer)

    timer = setInterval(() => {
      secondsLeft.value -= 1

      if (secondsLeft.value <= 0) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  }

  onBeforeUnmount(() => {
    clearInterval(timer)
  })

  return { secondsLeft, isCoolingDown, start }
}
