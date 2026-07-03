webpack运行一次npm run build的流程
1. 拆解npm run build 命令行参数
2. 根据package.json中的scripts.build配置，执行对应的构建命令
3. 根据对应的构建命令，找到对应的构建脚本文件
4. 根据这个脚本文件，得到一个最终配置对象，webpack根据这个最终配置对象，创建一个Compiler实例
5. Compiler实例依次注册plugin中的所有插件，并调用插件的apply方法，传入Compiler实例
6. 执行Compiler实例的run方法，创建一个Compilation实例
// 7. 找到入口文件，根据入口文件，依次递归找到所有的依赖文件，并根据依赖关系生成一个依赖图
// 8. 根据依赖图，依次执行所有的loader，将loader的返回值，替换掉依赖图中的对应节点，也就是将其他类型的数据变成webpack能看得懂的模块
// 9. webpack再根据配置文件中定义的分块规则，以及其自带的分块规则，将模块合并成一个个chunk
// 10. 最后，webpack根据配置文件中定义的输出规则，将chunk写入到文件系统中
// 11. 至此，构建完成


7. Compilation实例根据配置找到入口文件，将其转化成一个module，并添加到依赖图中。
   入口module会加入到待构建队列，等待被构建，webpack会遍历这个队列，依次取出每一个module
   先执行路径解析，确定模块的最终访问路径，然后如果是webpack不能直接解析的文件，会调用相应的loader进行处理
   处理完成之后，再通过AST分析，如果发现了import/require等导入语句，会递归的分析依赖的模块，然后将已经处理好的module添加到依赖图中

8. 等所有的module都处理完成后，待构建队列中没有剩余的module了，则make阶段完成，开始进入seal阶段
    seal阶段主要是将module进行合并，生成chunk块，优化和生成最终的bundle构建物。
    1. 整理模块图，例如，标记哪些模块是被使用过的，哪些模块没有被使用过,
    2. 分chunk块，按入口文件区分，如入口文件一个chunk，其他模块根据配置文件中定义的分块规则，以及其自带的分块规则，将模块合并成一个个chunk，动态导入的模块分成单独chunk。
    3. 再优化chunk块，看看能不能合能不能拆，例如splitChunks中定义的minSize,maxSize,minChunks,maxAsyncRequests,maxInitialRequests等规则。
    4. 再给这些module和chunk编号，便于后续的文件合并和输出。
    5. 为每个Module生成代码块
    6. 按Chunk拼成完整的JS，
    7. 压缩，hash，chunkhash，contenthash等，生成最终的bundle构建物。
    8. 将最终的bundle构建物写入到文件系统中。


    





webpack的打包流程：
1.输入npm run build 命令
2.根据package.json中的scripts.build配置，执行对应的构建命令
3.根据构建命令找到最终配置文件，启动webpack。
4.根据最终配置文件，创建一个Compiler实例
5.Compiler实例依次注册plugin中的所有插件，调用插件的apply方法，传入Compiler实例。
6.执行compiler实例的run方法，创建一个Compilation实例，开始执行当前这次编译流程。
7.进入make阶段，根据最终配置文件中的entry入口文件开始,将其添加到待处理列表，循环处理待处理列表中的每一个模块，转化为一个module，并且通过AST解析
   如果发现其他import/require等导入语句，则递归的分析依赖的模块，然后将已经处理好的module添加到依赖图中
8.等到所有的依赖都处理成module之后，待处理队列中没有剩余的module后，则make阶段结束，seal阶段开始
9.进入seal阶段，先是整理所有的module，例如，标记哪些模块是被使用过的，哪些模块没有被使用过,
   然后开始分chunk，根据webpack内置的分块规则，或者配置文件中定义的分块规则，将一个个单独的module模块合并成一个个chunk
   在优化chunk，例如能不能合并，能不能拆解，能不能提取公共模块，等等。
   最后给每个module和chunk编号，便于后续的文件合并和输出。
   为每个module生成代码块，一个个“砖块”，这些“砖块”最终会被拼成一个完整的chunk文件。
   按Chunk拼成完整的JS，JS压缩，hash，chunkhash，contenthash等，生成最终的bundle构建物。
   将最终的bundle构建物写入到文件系统中。
10.至此，构建完成。






webpack运行一次npm run build的流程：
1. 输入npm run build 命令
2. npm根据package.json中的scripts.build配置，执行对应的构建命令, 启动webpack
3. webpack CLI根据构建命令找到对应的配置文件以及解析CLI参数，组成一个最终配置对象
4. 再根据这个最终配置对象，创建一个Compiler实例
5. Compiler实例会遍历配置文件中的plugins，调用每个plugin的apply方法，传入Compiler实例，让plugin可以注册事件监听，以及监听webpack构建流程中的事件。
6. 然后调用Compiler实例的run方法，创建一个Compilation实例。
7. 开始执行当前这次编译流程
8. make阶段，compilation实例的主要工作是将所有用到的文件转化为module，分析依赖关系，添加到依赖图中。
    1.会从配置文件中定义好的entry入口文件开始处理，首先将其添加到待处理队列，待处理列表会循环处理其中的每一个module
    2.先执行路径解析，确定模块的最终访问路径，创建module实例并加入到依赖图。
    3.根据文件类型，调用对应的loader进行处理，将源码转成可parse的JS代码
    4.进行AST分析，如果发现了import/require等导入语句，则将导入的模块添加到待处理队列，等待被处理
    5.等到所有的文件都处理完成之后，待处理队列中没有剩余的文件后，则make阶段结束，seal阶段开始
//  Make 阶段：Compilation 从 entry 出发，把依赖链上的资源建成 Module，并逐步完善依赖图。
// 1. 从配置的 entry 创建首个 Module，加入待构建队列。
// 2. 循环处理队列中的每个 Module：
//    a. resolve，确定模块最终路径；
//    b. 执行 loader 链，得到可供解析的源码；
//    c. AST 解析，收集 import / require / import() 等依赖；
//    d. 为每个新依赖创建 Module，加入队列。
// 3. 队列为空 → Make 结束，进入 Seal。

9. seal阶段，compilation实例的主要工作是将所有module合并成一个个chunk，优化和生成最终的bundle构建物。

10. 最后，compilation实例将最终的bundle构建物写入到文件系统中。
11. 至此，构建完成。





防抖：触发事件后，在一定时间内再次触发事件，则重新计时，直到指定时间内没有触发事件，才会执行回调
节流：触发事件后，立即执行回调，同时，指定时间内，不会再次触发事件
function debounce(fn, delay) {
   let timer = null 
   return function(...args){
      clearTimeout(timer)
      timer = setTimeout(() => {
        fn.apply(this, args)
      }, delay)
   }
}
function throttle(fn, delay) {
   return function(...args){
      let now = new Date().getTime();
      let lastTime = 0
      if(now - lastTime < delay){
        return
      }
      lastTime = now
      fn.apply(this, args)
   }
}




webpack的打包流程：
1.




