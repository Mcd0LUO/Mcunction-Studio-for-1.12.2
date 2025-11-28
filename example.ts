class Parent {
    private privateField: string = "private";
    protected protectedField: string = "protected";
    
    public accessFields(): void {
        // 在自己的类内部，可以访问 private 和 protected 成员
        console.log(this.privateField);   // 正常工作
        console.log(this.protectedField); // 正常工作
    }
}

class Child extends Parent {
    public accessInheritedFields(): void {
        // console.log(this.privateField);   // 错误！无法访问父类的 private 成员
        console.log(this.protectedField); // 正常工作，可以访问父类的 protected 成员
    }
}

const obj = new Parent();
// obj.privateField;   // 错误！无法从类外部访问 private 成员
// obj.protectedField; // 错误！无法从类外部访问 protected 成员