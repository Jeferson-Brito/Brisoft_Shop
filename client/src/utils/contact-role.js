export function shouldDisplayEmployeeRole(ticketOrContact = null) {
  if (!ticketOrContact || typeof ticketOrContact !== 'object') return false

  const rawValue = ticketOrContact.is_employee
  if (rawValue === undefined || rawValue === null) return false

  return Boolean(rawValue) === true
}
