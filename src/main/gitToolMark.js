// The line that marks a launcher script as ours, so removing one never deletes
// somebody else's file of the same name. Its own module because BOTH launchers
// need it and neither should have to import the other.
export const MARK = '# diff-bro git tool'
